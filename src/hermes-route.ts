import type { Fetch } from "@typesafe-ai/sdk";
import { buildPrompt, DEFAULT_ROLE } from "./brief.ts";
import { FAILED, route, type Skipped, TIMEOUT } from "./compose.ts";
import { type Clock, raceDeadline } from "./deadline.ts";
import { type DecidedWithWork, decide } from "./decide.ts";
import { work } from "./effort.ts";
import { type HermesRequest, readRequest } from "./hermes-request.ts";
import { effortFor } from "./ladder.ts";
import { LINE_PREFIX, routedLine, skippedLine } from "./line.ts";
import { tier } from "./model.ts";
import { plan } from "./provider.ts";
import {
	CALLER_EFFORT,
	CONFIG_EFFORT,
	type EndSlot,
	modelUnset,
	slotForLevel,
} from "./reasons.ts";

export type HermesDeps = { readonly fetchFn: Fetch; readonly clock: Clock };
export type HermesResponse =
	| {
			readonly outcome: "route";
			// The slot whose model the level names; null at the middle level.
			readonly slot: EndSlot | null;
			// Null when the harness config or the delegating model sets the effort.
			readonly effort: string | null;
			readonly line: string;
	  }
	| { readonly outcome: "skip"; readonly line: string };

const skippedBy = (reason: string): Skipped => ({ skipped: reason });
export const skip = (reason: string): HermesResponse => ({
	outcome: "skip",
	line: `${LINE_PREFIX}${skippedLine(reason)}`,
});

// Jev is asked once for both parts, with the task, its context and its description under the default role.
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
			description: request.description,
			task: buildPrompt(request.task, request.context),
		},
		attempts: plan(request.provider, keys),
		keys,
		fetchFn,
		signal,
	});
	return decide(decision, tier.key, work.key);
}

// A rejected score is a failure of no known kind, not a run past the budget.
async function scored(
	request: HermesRequest,
	deps: HermesDeps,
	signal: AbortSignal,
): Promise<Awaited<ReturnType<typeof score>>> {
	try {
		return await score(request, deps, signal);
	} catch {
		return skippedBy(FAILED);
	}
}

/**
 * Returns the response for a decided request: a skip when an end tier has no
 * model, else the slot the level names, the effort the ladder gives and the
 * routing line. An effort the delegation section or the delegating model sets
 * replaces the ladder's, and the section's wins.
 * Every line starts with the line prefix.
 */
function answer(
	request: HermesRequest,
	decided: DecidedWithWork,
): HermesResponse {
	const level = decided.tier;
	const slot = slotForLevel(level);
	const target = slot === null ? undefined : request.models[slot];
	if (slot !== null && target === undefined) return skip(modelUnset(slot));
	const effort = effortFor(level, decided.work);
	const kept = request.configEffort
		? CONFIG_EFFORT
		: request.callerEffort
			? CALLER_EFFORT
			: undefined;
	return {
		outcome: "route",
		slot,
		effort: kept === undefined ? effort : null,
		line:
			LINE_PREFIX +
			routedLine({
				level,
				target,
				effort: kept ?? effort,
				probabilities: decided.probabilities,
				suffix: decided.suffix,
			}),
	};
}

/**
 * Returns the response to one parsed request. The budget bounds the whole run,
 * and only a run past it is a timeout skip. A budget that is missing or not a
 * positive finite number is a protocol fault, since Python skips a spent budget
 * itself and never sends it. That fault, a score that rejects and any other
 * failure give the failed skip. Never throws.
 */
export async function routeRequest(
	raw: unknown,
	deps: HermesDeps,
): Promise<HermesResponse> {
	try {
		const request = readRequest(raw);
		if (request === undefined) return skip(FAILED);
		if (request.budgetMs === undefined) return skip(FAILED);
		const decided = await raceDeadline(
			(signal) => scored(request, deps, signal),
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
