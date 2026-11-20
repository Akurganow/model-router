import { routingState } from "#core/brief/brief.ts";
import { type DecidedWithWork, scoreWork } from "#core/decision/decide.ts";
import { effortFor } from "#core/decision/ladder.ts";
import { pickModel, slotForLevel } from "#core/decision/slots.ts";
import { skippedLine } from "#core/output/line.ts";
import type { Provider } from "#core/providers/provider.ts";
import { limitSignal } from "#core/scoring/limit.ts";
import type { RouteInput, Skipped } from "#core/scoring/route.ts";
import { realClock } from "#utils/clock.ts";
import { lineFor, planEffort, type Routed } from "./effort.ts";
import type { Batch } from "./gates.ts";
import { type Facts, itemCheck, roleOf } from "./items.ts";
import type { Stored } from "./store.ts";

export type TaskItem = {
	readonly task: string;
	readonly name?: unknown;
	readonly agent?: string;
	readonly model?: unknown;
	readonly effort?: unknown;
};
// The agent is the item's own, or the default task agent.
export type Pending = {
	readonly index: number;
	readonly item: TaskItem;
	readonly agent: string;
};
type Scored = Pending & { readonly stored: Stored };

const MAX_PARALLEL = 4;

// One deadline covers the batch. Aborting also ends the retry wait, so no request follows a skip.
// A provider passed over once is dropped for items that start later, and only within this batch.
// An item the check skips sends nothing, and its reason is its line.
export async function scoreItems(
	items: readonly Pending[],
	context: string,
	{ attempts, facts }: Batch,
	deadline: number,
): Promise<Scored[]> {
	// A deadline the gates used up leaves no time to send anything.
	const limit = limitSignal(deadline, realClock);
	const passedOver = new Set<Provider>();
	try {
		return await mapLimit(items, MAX_PARALLEL, async (pending) => {
			const { item, agent } = pending;
			const reason = itemCheck(agent, facts, item.model);
			if (reason !== undefined) return { ...pending, stored: skipped(reason) };
			const routing = {
				attempts: attempts.filter((a) => !passedOver.has(a.provider)),
				onFallback: (p: Provider) => void passedOver.add(p),
			};
			const decided = await scoreItem(
				item,
				context,
				roleOf(agent, facts),
				routing,
				limit.signal,
			);
			return { ...pending, stored: toStored(decided, item, facts) };
		});
	} finally {
		limit.disarm();
	}
}

function scoreItem(
	item: TaskItem,
	context: string,
	role: string,
	routing: Pick<RouteInput, "attempts" | "onFallback">,
	signal: AbortSignal,
): Promise<DecidedWithWork | Skipped> {
	return scoreWork({
		state: routingState({
			role,
			description: item.name,
			task: item.task,
			context,
		}),
		...routing,
		fetchFn: fetch,
		clock: realClock,
		signal,
	});
}

const skipped = (reason: string): Stored => ({ line: skippedLine(reason) });

/**
 * Returns the stored entry for the levels Jev decided: the level, the
 * ladder's effort and the routing line, which names the picked slot's role or
 * the slot's state when it has none. The line shows
 * the effort the batch's facts allow, before the spawn's patterns are known.
 * Returns a skip line alone when the decision is a skip. Never throws.
 * omp composes the effort, the pick and the line here and does not call
 * outcomeOf: its effort plan reads the picked model and the omp settings, and
 * the line is built again at the spawn.
 */
function toStored(
	decided: DecidedWithWork | Skipped,
	item: TaskItem,
	facts: Facts,
): Stored {
	if ("skipped" in decided) return skipped(decided.skipped);
	const routed: Routed = {
		level: decided.tier,
		ladder: effortFor(decided.tier, decided.work),
		itemEffort: item.effort !== undefined,
		probabilities: decided.probabilities,
		suffix: decided.suffix,
	};
	const picked = pickModel(
		decided.tier,
		facts.models[slotForLevel(decided.tier)],
	);
	const plan = planEffort(routed, picked.model, facts);
	return { line: lineFor(routed, picked.target, plan), routed };
}

// Workers share one iterator, so each takes the next item as it frees up.
async function mapLimit<T, R>(
	items: readonly T[],
	limit: number,
	fn: (item: T) => Promise<R>,
): Promise<R[]> {
	const results: R[] = [];
	const queue = items.entries();
	const worker = async () => {
		for (const [i, item] of queue) results[i] = await fn(item);
	};
	await Promise.all(
		Array.from({ length: Math.min(limit, items.length) }, worker),
	);
	return results;
}
