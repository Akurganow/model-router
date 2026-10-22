import type { Fetch } from "@typesafe-ai/sdk";
import { buildPrompt } from "./brief.ts";
import {
	decisionSuffix,
	LIMIT_REACHED,
	ROUTING_LIMIT_MS,
	route,
} from "./compose.ts";
import { formatProbability, type Level, tier } from "./model.ts";
import { ROLES } from "./omp-gates.ts";
import type { Stored } from "./omp-store.ts";

export type TaskItem = { readonly task: string; readonly name?: unknown };
type Scored = {
	readonly index: number;
	readonly item: TaskItem;
	readonly stored: Stored;
};

const MAX_PARALLEL = 4;
// The task tool has no setting for the alias, so the router always asks the latest official Jev release.
const JEV_ALIAS = "jev-latest";
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
export async function scoreItems(
	items: readonly { index: number; item: TaskItem }[],
	context: string,
	apiKey: string,
): Promise<Scored[]> {
	const limit = new AbortController();
	const timer = setTimeout(() => limit.abort(LIMIT_REACHED), ROUTING_LIMIT_MS);
	try {
		return await mapLimit(items, MAX_PARALLEL, async ({ index, item }) => ({
			index,
			item,
			stored: await scoreItem(item, context, apiKey, limit.signal),
		}));
	} finally {
		clearTimeout(timer);
	}
}

async function scoreItem(
	item: TaskItem,
	context: string,
	apiKey: string,
	signal: AbortSignal,
): Promise<Stored> {
	const decision = await route({
		parts: [tier],
		state: {
			role: ROLE,
			description: typeof item.name === "string" ? item.name : "",
			task: buildPrompt(item.task, context),
		},
		model: JEV_ALIAS,
		apiKey,
		fetchFn: streamedFetch,
		signal,
	});
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
