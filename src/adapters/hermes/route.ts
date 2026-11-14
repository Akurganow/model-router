import type { Fetch } from "@typesafe-ai/sdk";
import { DEFAULT_ROLE, routingState } from "../../core/brief.ts";
import { LIMIT_REACHED, type Skipped } from "../../core/compose.ts";
import { type DecidedWithWork, scoreWork } from "../../core/decide.ts";
import { effortFor } from "../../core/ladder.ts";
import { LINE_PREFIX, routedLine, skippedLine } from "../../core/line.ts";
import { plan } from "../../core/provider.ts";
import {
	CALLER_EFFORT,
	CONFIG_EFFORT,
	FAILED,
	TIMEOUT,
} from "../../core/reasons.ts";
import {
	pickModel,
	type Slot,
	slotForLevel,
	slotState,
} from "../../core/slots.ts";
import type { Clock } from "../../utils/clock.ts";
import { raceDeadline } from "../../utils/deadline.ts";
import { type HermesRequest, type KeptEffort, readRequest } from "./request.ts";

type HermesDeps = { readonly fetchFn: Fetch; readonly clock: Clock };
type HermesResponse =
	| {
			readonly outcome: "route";
			// The slot the level takes its model from. Python applies it only when that slot is set.
			readonly slot: Slot;
			// Null when the request names a kept effort.
			readonly effort: string | null;
			readonly line: string;
	  }
	| { readonly outcome: "skip"; readonly line: string };

const skippedBy = (reason: string): Skipped => ({ skipped: reason });
export const skip = (reason: string): HermesResponse => ({
	outcome: "skip",
	line: `${LINE_PREFIX}${skippedLine(reason)}`,
});

const KEPT_LABELS: Readonly<Record<KeptEffort, string>> = {
	config: CONFIG_EFFORT,
	caller: CALLER_EFFORT,
};

// Jev is asked once for both parts, with the task, its context and its description under the default role.
async function score(
	request: HermesRequest,
	{ fetchFn }: HermesDeps,
	signal: AbortSignal,
) {
	const { keys } = request;
	return scoreWork({
		state: routingState({
			role: DEFAULT_ROLE,
			description: request.description,
			task: request.task,
			context: request.context,
		}),
		attempts: plan(request.provider, keys),
		keys,
		fetchFn,
		signal,
	});
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
 * Returns the response for a decided request: the slot the level names, the
 * effort the ladder gives and the routing line, which names the slot's model
 * or the slot's state when it has none. A kept effort replaces the ladder's,
 * and the line names its source.
 * Every line starts with the line prefix.
 */
function answer(
	request: HermesRequest,
	decided: DecidedWithWork,
): HermesResponse {
	const level = decided.tier;
	const slot = slotForLevel(level);
	const model = request.models[slot];
	const effort = effortFor(level, decided.work);
	const kept =
		request.keptEffort === undefined
			? undefined
			: KEPT_LABELS[request.keptEffort];
	return {
		outcome: "route",
		slot,
		effort: kept === undefined ? effort : null,
		line:
			LINE_PREFIX +
			routedLine({
				level,
				target: pickModel(level, slotState(model)).target,
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
			LIMIT_REACHED,
		);
		if (decided === undefined) return skip(TIMEOUT);
		return "skipped" in decided
			? skip(decided.skipped)
			: answer(request, decided);
	} catch {
		return skip(FAILED);
	}
}
