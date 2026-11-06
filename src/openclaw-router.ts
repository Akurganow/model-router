import type { Fetch } from "@typesafe-ai/sdk";
import { prepareBrief } from "./brief.ts";
import { route } from "./compose.ts";
import { decide } from "./decide.ts";
import { work } from "./effort.ts";
import { effortFor } from "./ladder.ts";
import { routedLine, skippedLine } from "./line.ts";
import { tier } from "./model.ts";
import { slotResolves } from "./openclaw-checks.ts";
import {
	type Clock,
	MIN_DEADLINE_MS,
	raceDeadline,
} from "./openclaw-deadline.ts";
import { type Gate, gateSpawn } from "./openclaw-gates.ts";
import { readSpawn, type SpawnRequest } from "./openclaw-params.ts";
import {
	type Environment,
	type OpenClawSettings,
	readState,
} from "./openclaw-settings.ts";
import type {
	BeforeToolCallEvent,
	BeforeToolCallHandler,
	BeforeToolCallResult,
	OpenClawApi,
	PluginRuntime,
	ToolContext,
} from "./openclaw-types.ts";
import { type Level, nonEmpty } from "./part.ts";
import { type Keys, plan } from "./provider.ts";

export const LINE_PREFIX = "model-router ";
export const SPAWN_TOOL = "sessions_spawn";
export const HOOK = "before_tool_call";
const MIDDLE_TIER = 1;
// An end tier names its slot in the skip text and the setting that holds its model.
const END_SLOTS = {
	0: { name: "small", model: (s: OpenClawSettings) => s.smallModel },
	2: { name: "large", model: (s: OpenClawSettings) => s.largeModel },
} as const;

export type RouterDeps = {
	readonly fetchFn: Fetch;
	readonly clock: Clock;
	readonly env: Environment;
};

type Route = Extract<Gate, { outcome: "route" }>;
// What the handler needs for one spawn. `log` writes nothing once the deadline or the hook's signal has ended the work.
type Spawn = {
	readonly api: OpenClawApi;
	readonly deps: RouterDeps;
	readonly signal: AbortSignal;
	readonly request: SpawnRequest;
	readonly requester: string | undefined;
	readonly log: (message: string) => void;
};

// Jev is asked once for both parts. The picked levels come back as a line and the slot to set.
async function score(
	{ deps, signal }: Spawn,
	settings: OpenClawSettings,
	keys: Keys,
	gate: Route,
) {
	const decision = await route({
		parts: [tier, work],
		state: {
			role: gate.role,
			description: gate.description,
			task: prepareBrief(gate.task),
		},
		attempts: plan(settings.provider, keys),
		keys,
		fetchFn: deps.fetchFn,
		signal,
	});
	return decide(decision, tier.key, work.key);
}

type Slot =
	| { readonly model: string | undefined }
	| { readonly skipped: string };

// The middle tier keeps the spawn's own model. An end tier needs its slot set and resolved for the agent.
async function slotFor(
	runtime: PluginRuntime,
	settings: OpenClawSettings,
	{ config, target }: Route,
	level: Level,
): Promise<Slot> {
	if (level === MIDDLE_TIER) return { model: undefined };
	const { name, model: slot } = END_SLOTS[level];
	const model = slot(settings);
	if (model === undefined) return { skipped: `${name} model unset` };
	if (!(await slotResolves(runtime, config, target, model)))
		return { skipped: `${name} model unresolved` };
	return { model };
}

async function routeSpawn(
	spawn: Spawn,
): Promise<BeforeToolCallResult | undefined> {
	const { api, deps, request, requester, log } = spawn;
	const { config, settings, keys } = readState(api, deps.env);
	const gate = gateSpawn({
		spawn: request,
		requester,
		config,
		settings,
		hasKey: Object.keys(keys).length > 0,
	});
	if (gate.outcome === "pass") return undefined;
	if (gate.outcome === "skip") return void log(skippedLine(gate.reason));
	const decided = await score(spawn, settings, keys, gate);
	if ("skipped" in decided) return void log(skippedLine(decided.skipped));
	const slot = await slotFor(api.runtime, settings, gate, decided.tier);
	if ("skipped" in slot) return void log(skippedLine(slot.skipped));
	const { model } = slot;
	const kept = gate.effort.kind === "keep" ? gate.effort.label : undefined;
	const effort = effortFor(decided.tier, decided.work);
	log(
		routedLine({
			level: decided.tier,
			target: model,
			effort: kept ?? effort,
			probabilities: decided.probabilities,
			suffix: decided.suffix,
		}),
	);
	const set = {
		...(model === undefined ? {} : { model }),
		...(kept === undefined ? { thinking: effort } : {}),
	};
	return Object.keys(set).length === 0 ? undefined : { params: set };
}

/**
 * The `before_tool_call` handler for `sessions_spawn`. It never throws and never blocks.
 * At the deadline the work is aborted and the handler settles on its own timer with nothing.
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
				(signal) => {
					// Once the deadline or the hook's signal ends the work, the work writes no line.
					const log = (message: string) => {
						if (!signal.aborted) api.logger.info(LINE_PREFIX + message);
					};
					return routeSpawn({
						api,
						deps,
						signal,
						request,
						requester,
						log,
					});
				},
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
