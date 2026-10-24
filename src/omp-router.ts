import { contextText } from "./brief.ts";
import { registerConfig, say } from "./omp-config.ts";
import { checkGates, openBatch, readSettings, resolves } from "./omp-gates.ts";
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

const LINE_PREFIX = "model-router ";
const ENTRY_SEPARATOR = " | ";

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

function createRouter(omp: OmpImports, pi: Pi) {
	const store = createStore();

	async function onToolCall(event: ToolCallEvent, ctx: Context) {
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
		const gates = await openBatch(omp, pi, ctx, settings);
		if ("closed" in gates) {
			const line = `skipped, ${gates.closed}`;
			return report(
				ctx,
				items.map(({ index }) => entry(index, line)),
			);
		}
		const scored = await scoreItems(items, contextText(context), gates);
		for (const { index, item, agent, stored } of scored)
			store.add(event.toolCallId, index, item.name, agent, stored);
		report(
			ctx,
			scored.map(({ index, stored }) => entry(index, stored.line)),
		);
	}

	async function onSpawn(
		event: SpawnEvent,
		ctx: Context,
	): Promise<SpawnResult | undefined> {
		if (event.invocationKind !== TASK) return;
		const stored = store.take(event.spawnKey, event.agent);
		if (!stored?.role) return;
		if ("closed" in (await checkGates(omp, pi, ctx, event))) return;
		if (!resolves(ctx, stored.role)) return;
		return { model: stored.role, note: LINE_PREFIX + stored.line };
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
