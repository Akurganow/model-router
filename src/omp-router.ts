import { contextText } from "./brief.ts";
import { ENTRY_SEPARATOR, LINE_PREFIX, skippedLine } from "./line.ts";
import { registerConfig, say } from "./omp-config.ts";
import { budgetFor } from "./omp-deadline.ts";
import {
	checkGates,
	noModel,
	openBatch,
	readSettings,
	readTimeoutSetting,
	resolves,
} from "./omp-gates.ts";
import { inScope, TASK } from "./omp-items.ts";
import { type Pending, scoreItems, type TaskItem } from "./omp-score.ts";
import { createStore } from "./omp-store.ts";
import type {
	Context,
	OmpImports,
	Pi,
	SpawnEvent,
	SpawnResult,
	ToolCallEvent,
	ToolProgressEvent,
} from "./omp-types.ts";
import { isRecord } from "./part.ts";

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
			store.add(event.toolCallId, index, item.name, agent, {
				...stored,
				index,
			});
		report(
			ctx,
			scored.map(({ index, stored }) => entry(index, stored.line)),
		);
	}

	// A gate that closed since the batch, or a role that stopped resolving, drops the decision.
	async function spawnReason(
		event: SpawnEvent,
		ctx: Context,
		role: string,
	): Promise<string | undefined> {
		const gates = await checkGates(omp, pi, ctx, event);
		if ("closed" in gates) return gates.closed;
		return resolves(ctx, role) ? undefined : noModel(role);
	}

	/**
	 * Returns the stored role and its line for a task spawn. Returns nothing when
	 * the spawn is not a task spawn, no decision matches, or the decision holds no
	 * role. When a gate closes or the role stopped resolving since the batch, it
	 * reports a skip line for the item and returns nothing.
	 */
	async function onSpawn(
		event: SpawnEvent,
		ctx: Context,
	): Promise<SpawnResult | undefined> {
		if (event.invocationKind !== TASK) return;
		const stored = store.take(event.spawnKey, event.agent);
		if (!stored?.role) return;
		const reason = await spawnReason(event, ctx, stored.role);
		if (reason === undefined)
			return { model: stored.role, note: LINE_PREFIX + stored.line };
		// omp drops a note that comes without a model, so the skip goes out like the batch line.
		if (stored.index !== undefined)
			report(ctx, [entry(stored.index, skippedLine(reason))]);
		return undefined;
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

// The adapter only picks the model. Effort stays with omp, and the tool input is never changed.
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
