import { routingState } from "#core/brief/brief.ts";
import { scoreWork } from "#core/decision/decide.ts";
import { outcomeOf } from "#core/decision/outcome.ts";
import { LINE_PREFIX, skippedLine } from "#core/output/line.ts";
import { type Keys, plan } from "#core/providers/provider.ts";
import { MIN_DEADLINE_MS } from "#core/scoring/handler-deadline.ts";
import { abortCategory, raceDeadline } from "#core/scoring/limit.ts";
import type { Fetch } from "#core/scoring/transport/send.ts";
import { type Clock, realClock } from "#utils/clock.ts";
import { nonEmpty } from "#utils/text.ts";
import { type Gate, gateSpawn } from "./gates.ts";
import { readSpawn, type SpawnRequest } from "./params.ts";
import {
	type Environment,
	type OpenClawSettings,
	readState,
} from "./settings.ts";
import type {
	BeforeToolCallEvent,
	BeforeToolCallHandler,
	BeforeToolCallResult,
	OpenClawApi,
	ToolContext,
} from "./types.ts";

export const SPAWN_TOOL = "sessions_spawn";
export const HOOK = "before_tool_call";

export type RouterDeps = {
	readonly fetchFn: Fetch;
	// Times the deadline only. The scoring call's own timers run on realClock.
	readonly clock: Clock;
	readonly env: Environment;
};

type Route = Extract<Gate, { outcome: "route" }>;
// What the handler needs for one spawn.
type Spawn = {
	readonly api: OpenClawApi;
	readonly deps: RouterDeps;
	readonly signal: AbortSignal;
	readonly request: SpawnRequest;
	readonly requester: string | undefined;
};

type SpawnLine = {
	readonly log: (message: string) => void;
	readonly close: () => void;
};

/**
 * Returns the writer of a spawn's one line, armed at once. `log` writes and
 * throws what the logger throws. The signal's abort writes `skipped, timeout`
 * for the routing limit and `skipped, cancelled` for the host's cancel, and
 * swallows a logger error. The first line or `close` ends the writer, so a
 * spawn gets one line at most and none after the work ends.
 */
function spawnLine(api: OpenClawApi, signal: AbortSignal): SpawnLine {
	let open = true;
	const onAbort = () => {
		if (!open) return;
		open = false;
		try {
			api.logger.info(LINE_PREFIX + skippedLine(abortCategory(signal)));
		} catch {
			// A throw inside an abort listener would escape as an uncaught exception.
		}
	};
	if (signal.aborted) onAbort();
	else signal.addEventListener("abort", onAbort, { once: true });
	return {
		log: (message) => {
			if (!open) return;
			open = false;
			api.logger.info(LINE_PREFIX + message);
		},
		close: () => {
			open = false;
			signal.removeEventListener("abort", onAbort);
		},
	};
}

// Jev is asked once for both parts. The picked levels come back as a line and the slot to set.
async function score(
	{ deps, signal }: Spawn,
	settings: OpenClawSettings,
	keys: Keys,
	gate: Route,
) {
	return scoreWork({
		state: routingState({
			role: gate.role,
			description: gate.description,
			task: gate.task,
		}),
		attempts: plan(settings.provider, keys),
		fetchFn: deps.fetchFn,
		clock: realClock,
		signal,
	});
}

/**
 * Returns the params to merge into the spawn, or undefined when the spawn stays
 * as written. Undefined covers a spawn that passes, a skip, and a route that
 * sets nothing. A passing spawn writes no line. Every other spawn writes one:
 * its skip, its route, or the deadline's or the host's abort. An error from
 * reading the state or scoring propagates to the hook, which catches it.
 */
async function routeSpawn(
	spawn: Spawn,
): Promise<BeforeToolCallResult | undefined> {
	const { api, deps, signal, request, requester } = spawn;
	const { config, settings, keys } = readState(api, deps.env);
	const gate = gateSpawn({
		spawn: request,
		requester,
		config,
		settings,
		hasKey: Object.keys(keys).length > 0,
	});
	if (gate.outcome === "pass") return undefined;
	const { log, close } = spawnLine(api, signal);
	try {
		return await routeGated(spawn, settings, keys, gate, log);
	} finally {
		close();
	}
}

// Routes a spawn past the pass gate, writing its one line through `log`.
async function routeGated(
	spawn: Spawn,
	settings: OpenClawSettings,
	keys: Keys,
	gate: Exclude<Gate, { outcome: "pass" }>,
	log: (message: string) => void,
): Promise<BeforeToolCallResult | undefined> {
	if (gate.outcome === "skip") return void log(skippedLine(gate.reason));
	const decided = await score(spawn, settings, keys, gate);
	if ("skipped" in decided) return void log(skippedLine(decided.skipped));
	const { model, effort, line } = outcomeOf(
		decided,
		settings.models,
		gate.effort.kind === "keep" ? gate.effort.label : undefined,
	);
	log(line);
	const set = {
		...(model === undefined ? {} : { model }),
		...(effort === undefined ? {} : { thinking: effort }),
	};
	return Object.keys(set).length === 0 ? undefined : { params: set };
}

/**
 * The `before_tool_call` handler for `sessions_spawn`. It never throws and never blocks.
 * At the deadline the work is aborted, the spawn logs `skipped, timeout`, and the
 * handler settles on its own timer with nothing. A host cancel logs `skipped, cancelled`.
 */
export function createBeforeToolCall(
	api: OpenClawApi,
	deadlineMs: number,
	deps: RouterDeps,
): BeforeToolCallHandler {
	return async (event: BeforeToolCallEvent, ctx: ToolContext) => {
		try {
			if (deadlineMs < MIN_DEADLINE_MS || event?.toolName !== SPAWN_TOOL)
				return undefined;
			const requester = nonEmpty(ctx?.agentId);
			const request = readSpawn(event.params);
			return await raceDeadline(
				(signal) => routeSpawn({ api, deps, signal, request, requester }),
				deadlineMs,
				deps.clock,
				ctx?.abortSignal,
			);
		} catch {
			// Reading a malformed event or context can throw.
			return undefined;
		}
	};
}
