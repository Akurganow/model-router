import { buildPrompt } from "./brief.ts";
import {
	type Decision,
	LIMIT_REACHED,
	ROUTING_LIMIT_MS,
	type RouteInput,
	route,
	type Skipped,
} from "./compose.ts";
import { decide } from "./decide.ts";
import { streamedFetch } from "./fetch.ts";
import { routedLine, skippedLine } from "./line.ts";
import { tier } from "./model.ts";
import { type Batch, ROLES } from "./omp-gates.ts";
import { itemCheck, roleOf } from "./omp-items.ts";
import type { Stored } from "./omp-store.ts";
import type { Level } from "./part.ts";
import type { Provider } from "./provider.ts";

export type TaskItem = {
	readonly task: string;
	readonly name?: unknown;
	readonly agent?: string;
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

// One limit covers the batch. Aborting also ends the SDK's retry wait, so no request follows a skip.
// A provider passed over once is dropped for items that start later, and only within this batch.
// An item the check skips sends nothing, and its reason is its line.
export async function scoreItems(
	items: readonly Pending[],
	context: string,
	{ attempts, keys, facts }: Batch,
): Promise<Scored[]> {
	const limit = new AbortController();
	const timer = setTimeout(() => limit.abort(LIMIT_REACHED), ROUTING_LIMIT_MS);
	const passedOver = new Set<Provider>();
	try {
		return await mapLimit(items, MAX_PARALLEL, async (pending) => {
			const { item, agent } = pending;
			const reason = itemCheck(agent, facts);
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
			return { ...pending, stored: toStored(decision) };
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
		parts: [tier],
		state: {
			role,
			description: typeof item.name === "string" ? item.name : "",
			task: buildPrompt(item.task, context),
		},
		...routing,
		fetchFn: streamedFetch,
		signal,
	});
}

const skipped = (reason: string): Stored => ({
	role: undefined,
	line: skippedLine(reason),
});

/**
 * Returns the stored entry for a decision that holds the tier part: the role of
 * the picked level with its routing line. Returns an entry with no role and a
 * skip line when the decision is a skip or lacks the part. Never throws.
 */
function toStored(decision: Decision | Skipped): Stored {
	const decided = decide(decision, tier.key);
	if ("skipped" in decided) return skipped(decided.skipped);
	const role = ROLE_BY_LEVEL[decided.tier];
	return {
		role,
		line: routedLine({
			level: decided.tier,
			target: role,
			probabilities: decided.probabilities,
			suffix: decided.suffix,
		}),
	};
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
