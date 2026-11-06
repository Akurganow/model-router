import type { Fetch } from "@typesafe-ai/sdk";
import { buildPrompt, DEFAULT_ROLE } from "./brief.ts";
import { FAILED, route, TIMEOUT } from "./compose.ts";
import { type DecidedWithWork, decide } from "./decide.ts";
import { work } from "./effort.ts";
import { type HermesRequest, readRequest } from "./hermes-request.ts";
import { effortFor } from "./ladder.ts";
import { routedLine, skippedLine } from "./line.ts";
import { tier } from "./model.ts";
import { type Clock, raceDeadline } from "./openclaw-deadline.ts";
import type { Level } from "./part.ts";
import { plan } from "./provider.ts";
import { CONFIG_EFFORT, type EndSlot, modelUnset } from "./reasons.ts";

export type HermesDeps = { readonly fetchFn: Fetch; readonly clock: Clock };
export type HermesResponse =
	| {
			readonly outcome: "route";
			readonly level: Level;
			// Null when the harness config sets the effort.
			readonly effort: string | null;
			readonly line: string;
	  }
	| { readonly outcome: "skip"; readonly line: string };

const MIDDLE_TIER = 1;
export const skip = (reason: string): HermesResponse => ({
	outcome: "skip",
	line: skippedLine(reason),
});

// An end tier names its slot in the skip text and the request field that holds its model.
const END_SLOTS: Readonly<
	Record<
		0 | 2,
		{ name: EndSlot; model: (r: HermesRequest) => string | undefined }
	>
> = {
	0: { name: "small", model: (r) => r.smallModel },
	2: { name: "large", model: (r) => r.largeModel },
};

// Jev is asked once for both parts, with the task and its context under the default role.
async function score(
	request: HermesRequest,
	{ fetchFn }: HermesDeps,
	signal: AbortSignal,
) {
	const { keys } = request;
	const decision = await route({
		parts: [tier, work],
		state: {
			role: DEFAULT_ROLE,
			description: "",
			task: buildPrompt(request.task, request.context),
		},
		attempts: plan(request.provider, keys),
		keys,
		fetchFn,
		signal,
	});
	return decide(decision, tier.key, work.key);
}

/**
 * Returns the response for a decided request: a skip when an end tier has no
 * model, else the level, the effort the ladder gives and the routing line.
 */
function answer(
	request: HermesRequest,
	decided: DecidedWithWork,
): HermesResponse {
	const level = decided.tier;
	const slot = level === MIDDLE_TIER ? undefined : END_SLOTS[level];
	const target = slot?.model(request);
	if (slot !== undefined && target === undefined)
		return skip(modelUnset(slot.name));
	const effort = effortFor(level, decided.work);
	return {
		outcome: "route",
		level,
		effort: request.configEffort ? null : effort,
		line: routedLine({
			level,
			target,
			effort: request.configEffort ? CONFIG_EFFORT : effort,
			probabilities: decided.probabilities,
			suffix: decided.suffix,
		}),
	};
}

/**
 * Returns the response to one parsed request. The budget bounds the whole run;
 * a run past it is a timeout skip. Any other failure is the failed skip.
 * Never throws.
 */
export async function routeRequest(
	raw: unknown,
	deps: HermesDeps,
): Promise<HermesResponse> {
	try {
		const request = readRequest(raw);
		if (request === undefined) return skip(FAILED);
		if (request.budgetMs === undefined) return skip(TIMEOUT);
		const decided = await raceDeadline(
			(signal) => score(request, deps, signal),
			request.budgetMs,
			deps.clock,
			undefined,
		);
		if (decided === undefined) return skip(TIMEOUT);
		return "skipped" in decided
			? skip(decided.skipped)
			: answer(request, decided);
	} catch {
		return skip(FAILED);
	}
}
