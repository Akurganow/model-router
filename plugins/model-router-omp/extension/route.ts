import {
	DEADLINE_MS,
	decisionSuffix,
	score,
	TIER_TEXTS,
	TransportError,
} from "./core.ts";
import { postJev } from "./jev.ts";
import { buildPrompt } from "./prompt.ts";

export type Task = {
	task: string;
	name?: unknown;
	effort?: unknown;
	[field: string]: unknown;
};
export type Outcome = { entry: string; item?: Task };
export type Run = {
	key: string;
	model: string;
	context: string;
	signal: AbortSignal;
};

const ROLE = "general-purpose";
const AGENTS = ["router_light", "router_mid", "router_heavy"] as const;
type Efforts = readonly ["lo" | "med", "med", "hi"];
// A small model at its lowest level stops early, so the light tier starts at med.
const EFFORTS: readonly [Efforts, Efforts, Efforts] = [
	["med", "med", "hi"],
	["lo", "med", "hi"],
	["lo", "med", "hi"],
];

const failure = (err: unknown) =>
	err instanceof Error ? err.message : String(err);

export const skipEntry = (position: number, reason: string): Outcome => ({
	entry: `task ${position}: skipped, ${reason}`,
});

// The signal ends the wait at once, so the next request meets the passed deadline and does not go out.
const sleepUntil =
	(signal: AbortSignal) =>
	(ms: number): Promise<void> =>
		new Promise((resolve) => {
			if (signal.aborted) return resolve();
			const done = () => {
				clearTimeout(timer);
				signal.removeEventListener("abort", done);
				resolve();
			};
			const timer = setTimeout(done, ms);
			signal.addEventListener("abort", done, { once: true });
		});

export async function routeItem(
	position: number,
	item: Task,
	run: Run,
): Promise<Outcome> {
	try {
		let raw = "";
		const post = async (body: string): Promise<string> => {
			if (run.signal.aborted) throw new TransportError("timeout");
			raw = await postJev(fetch, run.key, body, run.signal);
			return raw;
		};
		const description = typeof item.name === "string" ? item.name : "";
		const scored = await score(
			{
				role: ROLE,
				description,
				prompt: buildPrompt(item.task, run.context),
				model: run.model,
			},
			TIER_TEXTS,
			post,
			{ sleep: sleepUntil(run.signal) },
		);
		if ("skipped" in scored) return skipEntry(position, scored.skipped);
		const { level, workIndex, probabilities } = scored;
		const keep = item.effort !== undefined;
		const effort = EFFORTS[level][workIndex];
		const agent = AGENTS[level];
		const p = `${probabilities.tier[level].toFixed(2)}/${probabilities.work[workIndex].toFixed(2)}`;
		return {
			entry: `task ${position}: L${level} ${agent} · ${keep ? "caller effort" : effort} · p=${p}${decisionSuffix(raw)}`,
			item: { ...item, agent, ...(keep ? {} : { effort }) },
		};
	} catch (err) {
		return skipEntry(position, failure(err));
	}
}

export const batchDeadline = (): AbortSignal =>
	AbortSignal.timeout(DEADLINE_MS);

// Workers share one iterator, so each takes the next item as it frees up.
export async function mapLimit<T, R>(
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
