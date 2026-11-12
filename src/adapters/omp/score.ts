import { routingState } from "../../core/brief.ts";
import {
	type Decision,
	LIMIT_REACHED,
	type RouteInput,
	route,
	type Skipped,
} from "../../core/compose.ts";
import { decide } from "../../core/decide.ts";
import { work } from "../../core/effort.ts";
import { effortFor } from "../../core/ladder.ts";
import { skippedLine } from "../../core/line.ts";
import { tier } from "../../core/model.ts";
import type { Level } from "../../core/part.ts";
import type { Provider } from "../../core/provider.ts";
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
const ROLE_BY_LEVEL: Record<Level, string | undefined> = {
	0: ROLES.small,
	1: undefined,
	2: ROLES.large,
};

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
			const decision = await scoreItem(
				item,
				context,
				roleOf(agent, facts),
				routing,
				limit.signal,
			);
			return { ...pending, stored: toStored(decision, item, facts) };
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
): Promise<Decision | Skipped> {
	return route({
		parts: [tier, work],
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
 * Returns the stored entry for a decision that holds both parts: the role of
 * the picked level, the ladder's effort and the routing line. The line shows
 * the effort the batch's facts allow, before the spawn's patterns are known.
 * Returns a skip line alone when the decision is a skip or lacks a part. Never
 * throws.
 */
function toStored(
	decision: Decision | Skipped,
	item: TaskItem,
	facts: Facts,
): Stored {
	const decided = decide(decision, tier.key, work.key);
	if ("skipped" in decided) return skipped(decided.skipped);
	const routed: Routed = {
		level: decided.tier,
		role: ROLE_BY_LEVEL[decided.tier],
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
