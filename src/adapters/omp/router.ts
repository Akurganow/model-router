import { contextText } from "../../core/brief.ts";
import { ENTRY_SEPARATOR, LINE_PREFIX, skippedLine } from "../../core/line.ts";
import { pickModel, slotForLevel } from "../../core/slots.ts";
import { isRecord } from "../../utils/guards.ts";
import { registerConfig, say } from "./config.ts";
import { budgetFor } from "./deadline.ts";
import { lineFor, modelFor, planEffort } from "./effort.ts";
import { checkGates, openBatch } from "./gates.ts";
import { inScope, TASK } from "./items.ts";
import { type Pending, scoreItems, type TaskItem } from "./score.ts";
import { readSettings, readTimeoutSetting } from "./settings.ts";
import { createStore } from "./store.ts";
import type {
	Context,
	OmpImports,
	Pi,
	SpawnEvent,
	SpawnResult,
	ToolCallEvent,
	ToolProgressEvent,
} from "./types.ts";

function isEligible(item: unknown): item is TaskItem {
	if (!isRecord(item)) return false;
	const { agent, task } = item;
	return (
		(agent === undefined || typeof agent === "string") &&
		typeof task === "string" &&
		task !== ""
	);
}

// Every handler answers for itself: an error leaves the task unrouted and never reaches omp.
async function attempt<T>(fn: () => Promise<T>): Promise<T | undefined> {
	try {
		return await fn();
	} catch {
		return undefined;
	}
}

function report(ctx: Context, entries: readonly string[]): void {
	say(ctx, LINE_PREFIX + entries.join(ENTRY_SEPARATOR));
}

const entry = (index: number, line: string) => `task ${index + 1}: ${line}`;

const eligibleItems = (tasks: unknown[]): Pending[] =>
	tasks.flatMap((item, index) =>
		isEligible(item) ? [{ index, item, agent: item.agent ?? TASK }] : [],
	);

/**
 * Returns the handlers for tool calls, spawns and progress events, all sharing
 * one store of decisions. A handler returns nothing, or the model and note for
 * a spawn, and never changes the tool input. It does not catch errors, so the
 * caller wraps each handler.
 */
function createRouter(omp: OmpImports, pi: Pi) {
	const store = createStore();

	/**
	 * Scores the eligible items of a task call and reports one line per item.
	 * Reports one skip line for every in-scope item when a batch gate closes or
	 * omp's tool call timeout leaves too little time to score. Returns nothing
	 * when the call is not a task call, holds no eligible item, or holds none in
	 * scope.
	 */
	async function onToolCall(event: ToolCallEvent, ctx: Context) {
		// omp's timeout runs from the handler's start, so every read below spends the deadline.
		const started = Date.now();
		const { input } = event;
		if (event.toolName !== TASK || !isRecord(input)) return;
		const { tasks, context } = input;
		if (!Array.isArray(tasks)) return;
		const eligible = eligibleItems(tasks);
		if (eligible.length === 0) return;
		const settings = await readSettings(omp, ctx.cwd);
		// Unreadable settings leave only the core scope's items to close the batch.
		const scope = settings?.scope ?? "core";
		const items = eligible.filter(({ agent }) => inScope(agent, scope));
		if (items.length === 0) return;
		const skipAll = (reason: string) =>
			report(
				ctx,
				items.map(({ index }) => entry(index, skippedLine(reason))),
			);
		// A timeout too short to score closes the batch before any key or agent is read.
		const budget = budgetFor(readTimeoutSetting(omp.lookup, pi.pi.settings));
		if ("closed" in budget) return skipAll(budget.closed);
		const gates = await openBatch(omp, pi, ctx, settings);
		if ("closed" in gates) return skipAll(gates.closed);
		const scored = await scoreItems(
			items,
			contextText(context),
			gates,
			budget.deadline - (Date.now() - started),
		);
		for (const { index, item, agent, stored } of scored)
			store.add(event.toolCallId, index, item.name, agent, stored);
		report(
			ctx,
			scored.map(({ index, stored }) => entry(index, stored.line)),
		);
	}

	/**
	 * Returns the model and the line for a task spawn: the picked slot's role,
	 * or the spawn's own patterns when the slot has no model, with the effort
	 * as a suffix where the plugin sets one. The slots are read again, so a
	 * role returned here resolved in this call. Returns nothing when the spawn
	 * is not a task spawn, no routed decision matches, or a slot with no model
	 * sets no effort. When a gate closes since the batch, it reports a skip line
	 * for the item and returns nothing. When the line differs from the batch
	 * line, it reports the new line for the item.
	 */
	async function onSpawn(
		event: SpawnEvent,
		ctx: Context,
	): Promise<SpawnResult | undefined> {
		if (event.invocationKind !== TASK) return;
		const taken = store.take(event.spawnKey, event.agent);
		const routed = taken?.stored.routed;
		if (!taken || !routed) return;
		const gates = await checkGates(omp, pi, ctx, event);
		// omp drops a note that comes without a model, so a spawn-time line goes out like the batch line.
		if ("closed" in gates)
			return void report(ctx, [entry(taken.index, skippedLine(gates.closed))]);
		const patterns = event.patterns ?? [];
		const picked = pickModel(
			routed.level,
			gates.facts.models[slotForLevel(routed.level)],
		);
		const plan = planEffort(routed, picked.model, gates.facts, patterns);
		const line = lineFor(routed, picked.target, plan);
		if (line !== taken.stored.line) report(ctx, [entry(taken.index, line)]);
		const model = modelFor(picked.model, plan, patterns);
		return model === undefined
			? undefined
			: { model, note: LINE_PREFIX + line };
	}

	function learn({ toolName, toolCallId }: ToolProgressEvent, result: unknown) {
		if (toolName !== TASK) return;
		const { details } = isRecord(result) ? result : {};
		const { progress } = isRecord(details) ? details : {};
		store.learn(toolCallId, progress);
	}

	function onToolEnd(event: ToolProgressEvent) {
		learn(event, event.result);
		if (event.toolName === TASK) store.end(event.toolCallId);
	}

	return { onToolCall, onSpawn, learn, onToolEnd };
}

// The adapter sets the model role and the effort through the spawn hook. The tool input is never changed.
export function createExtension(omp: OmpImports): (pi: Pi) => void {
	return (pi) => {
		const router = createRouter(omp, pi);
		registerConfig(omp, pi);
		pi.on("tool_call", async (event, ctx) => {
			await attempt(() => router.onToolCall(event, ctx));
			return undefined;
		});
		pi.on("tool_execution_update", async (event) => {
			await attempt(async () => router.learn(event, event.partialResult));
		});
		pi.on("tool_execution_end", async (event) => {
			await attempt(async () => router.onToolEnd(event));
		});
		pi.on("before_subagent_spawn", (event, ctx) =>
			attempt(() => router.onSpawn(event, ctx)),
		);
	};
}
