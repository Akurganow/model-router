import {
	DEADLINE_MS,
	decisionSuffix,
	prepareBrief,
	score,
	TIER_TEXTS,
	TransportError,
} from "./core.ts";
import { chooseEffort, chooseLightEffort, type TaskEffort } from "./effort.ts";
import { postJev } from "./jev.ts";
import { buildPrompt } from "./prompt.ts";
import type { ModelLike } from "./types.ts";

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
	// Present only when the user chose the router's effort over omp's own.
	effort?: { model(agent: Agent): ModelLike | undefined };
};

const ROLE = "general-purpose";
// A batch item's name is a short label; a longer one is cut, and secrets in it are masked.
const NAME_CHARS = 200;
const AGENTS = ["router_light", "router_mid", "router_heavy"] as const;
export type Agent = (typeof AGENTS)[number];
// The model selectors in each agent's frontmatter, tried in order.
export const SELECTORS: Record<Agent, readonly string[]> = {
	router_light: ["@router_light", "@smol"],
	router_mid: ["@router_mid", "@task"],
	router_heavy: ["@router_heavy", "@slow"],
};
type Efforts = readonly [TaskEffort, TaskEffort, TaskEffort];
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
		const description =
			typeof item.name === "string" ? prepareBrief(item.name, NAME_CHARS) : "";
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
		const agent = AGENTS[level];
		const choice =
			keep || run.effort === undefined
				? undefined
				: (level === 0 ? chooseLightEffort : chooseEffort)(
						EFFORTS[level][workIndex],
						run.effort.model(agent),
					);
		const shown = keep ? "caller effort" : (choice?.shown ?? "auto");
		const p = `${probabilities.tier[level].toFixed(2)}/${probabilities.work[workIndex].toFixed(2)}`;
		return {
			entry: `task ${position}: L${level} ${agent} · ${shown} · p=${p}${decisionSuffix(raw)}`,
			item: { ...item, agent, ...(choice ? { effort: choice.effort } : {}) },
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
