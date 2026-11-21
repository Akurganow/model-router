import { DEFAULT_ROLE, routingState } from "#core/brief/brief.ts";
import { type DecidedWithWork, scoreWork } from "#core/decision/decide.ts";
import { outcomeOf } from "#core/decision/outcome.ts";
import type { Slot } from "#core/decision/slots.ts";
import { type Settings, settingsOf } from "#core/options/settings.ts";
import { LINE_PREFIX, skippedLine } from "#core/output/line.ts";
import {
	CALLER_EFFORT,
	CONFIG_EFFORT,
	FAILED,
	TIMEOUT,
} from "#core/output/reasons.ts";
import { plan } from "#core/providers/provider.ts";
import { raceDeadline } from "#core/scoring/limit.ts";
import type { Skipped } from "#core/scoring/route.ts";
import type { Fetch } from "#core/scoring/transport/send.ts";
import { type Clock, realClock } from "#utils/clock.ts";
import { type HermesRequest, type KeptEffort, readRequest } from "./request.ts";

type HermesDeps = {
	readonly fetchFn: Fetch;
	// Times the deadline only. The scoring call's own timers run on realClock.
	readonly clock: Clock;
};
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
	settings: Settings,
	{ fetchFn }: HermesDeps,
	signal: AbortSignal,
) {
	return scoreWork({
		state: routingState({
			role: DEFAULT_ROLE,
			description: request.description,
			task: request.task,
			context: request.context,
		}),
		attempts: plan(settings, request.keys),
		fetchFn,
		clock: realClock,
		signal,
	});
}

// A rejected score is a failure of no known kind, not a run past the budget.
async function scored(
	request: HermesRequest,
	settings: Settings,
	deps: HermesDeps,
	signal: AbortSignal,
): Promise<Awaited<ReturnType<typeof score>>> {
	try {
		return await score(request, settings, deps, signal);
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
	const { slot, effort, line } = outcomeOf(
		decided,
		request.models,
		request.keptEffort === undefined
			? undefined
			: KEPT_LABELS[request.keptEffort],
	);
	return {
		outcome: "route",
		slot,
		effort: effort ?? null,
		line: LINE_PREFIX + line,
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
		const settings = settingsOf(request.stored);
		if ("skipped" in settings) return skip(settings.skipped);
		if (request.budgetMs === undefined) return skip(FAILED);
		const decided = await raceDeadline(
			(signal) => scored(request, settings, deps, signal),
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
