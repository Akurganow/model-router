import { contextText } from "./brief.ts";
import { isRecord } from "./model.ts";
import { checkGates, resolves } from "./omp-gates.ts";
import { scoreItems, type TaskItem } from "./omp-score.ts";
import { createStore } from "./omp-store.ts";
import type {
	Context,
	Lookup,
	Pi,
	SpawnEvent,
	SpawnResult,
	ToolCallEvent,
	ToolProgressEvent,
} from "./omp-types.ts";

const LINE_PREFIX = "model-router ";
const ENTRY_SEPARATOR = " | ";
const TASK = "task";

function isEligible(item: unknown): item is TaskItem {
	if (!isRecord(item)) return false;
	const { agent, task } = item;
	return (
		(agent === undefined || agent === TASK) &&
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
	const line = LINE_PREFIX + entries.join(ENTRY_SEPARATOR);
	try {
		if (ctx.hasUI) ctx.ui.notify(line);
		else process.stderr.write(`${line}\n`);
	} catch {
		// A failed report must never block the spawn.
	}
}

const entry = (index: number, line: string) => `task ${index + 1}: ${line}`;

// The adapter only picks the model. Effort stays with omp, and the tool input is never changed.
export function createExtension(lookup: Lookup): (pi: Pi) => void {
	return (pi) => {
		const store = createStore();

		async function onToolCall(event: ToolCallEvent, ctx: Context) {
			const { input } = event;
			if (event.toolName !== TASK || !isRecord(input)) return;
			const { tasks, context } = input;
			if (!Array.isArray(tasks)) return;
			const items = tasks.flatMap((item, index) =>
				isEligible(item) ? [{ index, item }] : [],
			);
			if (items.length === 0) return;
			const gates = await checkGates(lookup, pi, ctx);
			if ("closed" in gates) {
				const line = `skipped, ${gates.closed}`;
				return report(
					ctx,
					items.map(({ index }) => entry(index, line)),
				);
			}
			const scored = await scoreItems(items, contextText(context), gates.key);
			for (const { index, item, stored } of scored)
				store.add(event.toolCallId, index, item.name, stored);
			report(
				ctx,
				scored.map(({ index, stored }) => entry(index, stored.line)),
			);
		}

		async function onSpawn(
			event: SpawnEvent,
			ctx: Context,
		): Promise<SpawnResult | undefined> {
			if (event.agent !== TASK || event.invocationKind !== TASK) return;
			const stored = store.take(event.spawnKey);
			if (!stored?.role || event.modelRole) return;
			if ("closed" in (await checkGates(lookup, pi, ctx))) return;
			if (!resolves(ctx, stored.role)) return;
			return { model: stored.role, note: LINE_PREFIX + stored.line };
		}

		function learn(
			{ toolName, toolCallId }: ToolProgressEvent,
			result: unknown,
		) {
			if (toolName !== TASK) return;
			const { details } = isRecord(result) ? result : {};
			const { progress } = isRecord(details) ? details : {};
			store.learn(toolCallId, progress);
		}

		pi.on("tool_call", async (event, ctx) => {
			await attempt(() => onToolCall(event, ctx));
			return undefined;
		});
		pi.on("tool_execution_update", async (event) => {
			await attempt(async () => learn(event, event.partialResult));
		});
		pi.on("tool_execution_end", async (event) => {
			await attempt(async () => {
				learn(event, event.result);
				if (event.toolName === TASK) store.end(event.toolCallId);
			});
		});
		pi.on("before_subagent_spawn", (event, ctx) =>
			attempt(() => onSpawn(event, ctx)),
		);
	};
}
