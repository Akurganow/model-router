import type { Fetch } from "@typesafe-ai/sdk";
import { buildPrompt } from "./brief.ts";
import {
	type Decision,
	decisionSuffix,
	LIMIT_REACHED,
	ROUTING_LIMIT_MS,
	type RouteInput,
	route,
	type Skipped,
} from "./compose.ts";
import { tier } from "./model.ts";
import { ROLES, type Routing } from "./omp-gates.ts";
import type { Stored } from "./omp-store.ts";
import { formatProbability, type Level } from "./part.ts";
import type { Provider } from "./provider.ts";

export type TaskItem = { readonly task: string; readonly name?: unknown };
type Scored = {
	readonly index: number;
	readonly item: TaskItem;
	readonly stored: Stored;
};

const MAX_PARALLEL = 4;
const ROLE = "general-purpose";
const ROLE_BY_LEVEL: Record<Level, string | undefined> = {
	0: ROLES.small,
	1: undefined,
	2: ROLES.large,
};

export const oneChunk = (bytes: Uint8Array) =>
	new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(bytes);
			controller.close();
		},
	});

// Bun gives the SDK a buffered reply whose body reads as already used. A stream-bodied copy reads fine.
export const streamedFetch: Fetch = async (url, init) => {
	const reply = await globalThis.fetch(url, init);
	const bytes = new TextEncoder().encode(await reply.text());
	return new Response(oneChunk(bytes), {
		status: reply.status,
		statusText: reply.statusText,
		headers: reply.headers,
	});
};

// One limit covers the batch. Aborting also ends the SDK's retry wait, so no request follows a skip.
// A provider passed over once is dropped for items that start later, and only within this batch.
export async function scoreItems(
	items: readonly { index: number; item: TaskItem }[],
	context: string,
	{ attempts, keys }: Routing,
): Promise<Scored[]> {
	const limit = new AbortController();
	const timer = setTimeout(() => limit.abort(LIMIT_REACHED), ROUTING_LIMIT_MS);
	const passedOver = new Set<Provider>();
	try {
		return await mapLimit(items, MAX_PARALLEL, async ({ index, item }) => {
			const routing = {
				attempts: attempts.filter((a) => !passedOver.has(a.provider)),
				keys,
				onFallback: (p: Provider) => void passedOver.add(p),
			};
			const decision = await scoreItem(item, context, routing, limit.signal);
			return { index, item, stored: toStored(decision) };
		});
	} finally {
		clearTimeout(timer);
	}
}

function scoreItem(
	item: TaskItem,
	context: string,
	routing: Pick<RouteInput, "attempts" | "keys" | "onFallback">,
	signal: AbortSignal,
): Promise<Decision | Skipped> {
	return route({
		parts: [tier],
		state: {
			role: ROLE,
			description: typeof item.name === "string" ? item.name : "",
			task: buildPrompt(item.task, context),
		},
		...routing,
		fetchFn: streamedFetch,
		signal,
	});
}

function toStored(decision: Decision | Skipped): Stored {
	const skip = (reason: string): Stored => ({
		role: undefined,
		line: `skipped, ${reason}`,
	});
	if ("skipped" in decision) return skip(decision.skipped);
	const part = decision.parts[tier.key];
	if (!part) return skip("bad reply");
	const role = ROLE_BY_LEVEL[part.level];
	const p = formatProbability(part.probabilities[part.level]);
	return {
		role,
		line: `L${part.level} ${role ?? "no change"} · p=${p}${decisionSuffix(decision)}`,
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
