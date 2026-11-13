import { routingState } from "../../core/brief.ts";
import {
	LIMIT_REACHED,
	type RouteInput,
	type Skipped,
} from "../../core/compose.ts";
import { type DecidedWithWork, scoreWork } from "../../core/decide.ts";
import { effortFor } from "../../core/ladder.ts";
import { skippedLine } from "../../core/line.ts";
import type { Provider } from "../../core/provider.ts";
import { slotForLevel } from "../../core/slots.ts";
import { streamedFetch } from "../../utils/fetch.ts";
import { lineFor, planEffort, type Routed } from "./effort.ts";
import { type Batch, ROLES } from "./gates.ts";
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

// One deadline covers the batch. Aborting also ends the SDK's retry wait, so no request follows a skip.
// A provider passed over once is dropped for items that start later, and only within this batch.
// An item the check skips sends nothing, and its reason is its line.
export async function scoreItems(
	items: readonly Pending[],
	context: string,
	{ attempts, keys, facts }: Batch,
	deadline: number,
): Promise<Scored[]> {
	const limit = new AbortController();
	// A deadline the gates used up leaves no time to send anything.
	if (deadline <= 0) limit.abort(LIMIT_REACHED);
	const timer = setTimeout(() => limit.abort(LIMIT_REACHED), deadline);
	const passedOver = new Set<Provider>();
	try {
		return await mapLimit(items, MAX_PARALLEL, async (pending) => {
			const { item, agent } = pending;
			const reason = itemCheck(agent, facts, item.model);
			if (reason !== undefined) return { ...pending, stored: skipped(reason) };
			const routing = {
				attempts: attempts.filter((a) => !passedOver.has(a.provider)),
				keys,
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
		clearTimeout(timer);
	}
}

function scoreItem(
	item: TaskItem,
	context: string,
	role: string,
	routing: Pick<RouteInput, "attempts" | "keys" | "onFallback">,
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
		fetchFn: streamedFetch,
		signal,
	});
}

const skipped = (reason: string): Stored => ({ line: skippedLine(reason) });

/**
 * Returns the stored entry for the levels Jev decided: the role of
 * the picked level, the ladder's effort and the routing line. The line shows
 * the effort the batch's facts allow, before the spawn's patterns are known.
 * Returns a skip line alone when the decision is a skip. Never throws.
 */
function toStored(
	decided: DecidedWithWork | Skipped,
	item: TaskItem,
	facts: Facts,
): Stored {
	if ("skipped" in decided) return skipped(decided.skipped);
	const slot = slotForLevel(decided.tier);
	const routed: Routed = {
		level: decided.tier,
		role: slot === null ? undefined : ROLES[slot],
		ladder: effortFor(decided.tier, decided.work),
		itemEffort: item.effort !== undefined,
		probabilities: decided.probabilities,
		suffix: decided.suffix,
	};
	return { line: lineFor(routed, planEffort(routed, facts)), routed };
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
