import type { Fetch } from "@typesafe-ai/sdk";
import { prepareBrief } from "./brief.ts";
import { LIMIT_REACHED, route } from "./compose.ts";
import { decide } from "./decide.ts";
import { work } from "./effort.ts";
import { effortFor } from "./ladder.ts";
import { routedLine, skippedLine } from "./line.ts";
import { tier } from "./model.ts";
import { slotResolves } from "./openclaw-checks.ts";
import { type Gate, gateSpawn } from "./openclaw-gates.ts";
import {
	type Environment,
	type Keys,
	type OpenClawSettings,
	readKeys,
	readSettings,
} from "./openclaw-settings.ts";
import type {
	BeforeToolCallEvent,
	BeforeToolCallHandler,
	BeforeToolCallResult,
	OpenClawApi,
	OpenClawConfig,
	SpawnParams,
	ToolContext,
} from "./openclaw-types.ts";
import { type Level, nonEmpty } from "./part.ts";
import { plan } from "./provider.ts";
import { UNREADABLE } from "./settings.ts";

// Below this the deadline leaves too little time for one Jev request.
export const MIN_DEADLINE_MS = 1000;
export const LINE_PREFIX = "model-router ";
const SPAWN_TOOL = "sessions_spawn";
const SLOT_NAMES = { 0: "small", 2: "large" } as const;

export type Clock = {
	after: (ms: number, fn: () => void) => { cancel: () => void };
};
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
	readonly params: SpawnParams;
	readonly requester: string | undefined;
	readonly log: (message: string) => void;
};

function liveConfig(api: OpenClawApi): OpenClawConfig | undefined {
	try {
		return api.runtime.config.current();
	} catch {
		return undefined;
	}
}

const hasKeys = (keys: Keys): boolean => Object.keys(keys).length > 0;

// Jev is asked once for both parts. The picked levels come back as a line and the slot to set.
async function score(
	{ deps, signal, params }: Spawn,
	settings: OpenClawSettings,
	keys: Keys,
	gate: Route,
) {
	const decision = await route({
		parts: [tier, work],
		state: {
			role: gate.role,
			description: nonEmpty(params.label) ?? nonEmpty(params.taskName) ?? "",
			task: prepareBrief(String(params.task)),
		},
		attempts: plan(settings.provider, {
			typesafe: keys.typesafe !== undefined,
			openrouter: keys.openrouter !== undefined,
		}),
		keys,
		fetchFn: deps.fetchFn,
		signal,
	});
	return decide(decision, tier.key, work.key);
}

function slotFor(settings: OpenClawSettings, level: Level) {
	if (level === 1) return { name: undefined, model: undefined };
	return {
		name: SLOT_NAMES[level],
		model: level === 0 ? settings.smallModel : settings.largeModel,
	};
}

async function routeSpawn(
	spawn: Spawn,
): Promise<BeforeToolCallResult | undefined> {
	const { api, deps, params, requester, log } = spawn;
	const config = liveConfig(api);
	const settings = readSettings(config, api.pluginConfig);
	const keys = readKeys(config, api.pluginConfig, settings.provider, deps.env);
	const gate = gateSpawn({
		params,
		requester,
		config,
		settings,
		hasKey: hasKeys(keys),
	});
	if (gate.outcome === "pass") return undefined;
	if (gate.outcome === "skip") return void log(skippedLine(gate.reason));
	// Without the config the user's own subagent model and effort cannot be checked.
	if (config === undefined) return void log(skippedLine(UNREADABLE));
	const decided = await score(spawn, settings, keys, gate);
	if ("skipped" in decided) return void log(skippedLine(decided.skipped));
	const { name, model } = slotFor(settings, decided.tier);
	if (name !== undefined) {
		if (model === undefined)
			return void log(skippedLine(`${name} model unset`));
		if (!(await slotResolves(api.runtime, config, gate.agentId, model)))
			return void log(skippedLine(`${name} model unresolved`));
	}
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
		if (deadlineMs < MIN_DEADLINE_MS || event.toolName !== SPAWN_TOOL)
			return undefined;
		const stop = new AbortController();
		const signal = AbortSignal.any(
			ctx.abortSignal ? [stop.signal, ctx.abortSignal] : [stop.signal],
		);
		const log = (message: string) => {
			if (!signal.aborted) api.logger.info(LINE_PREFIX + message);
		};
		return await new Promise<BeforeToolCallResult | undefined>((settle) => {
			const timer = deps.clock.after(deadlineMs, () => {
				stop.abort(LIMIT_REACHED);
				settle(undefined);
			});
			const requester = nonEmpty(ctx.agentId);
			routeSpawn({ api, deps, signal, params: event.params, requester, log })
				.catch(() => undefined)
				.then((result) => (signal.aborted ? undefined : result))
				.then(settle)
				.finally(() => timer.cancel());
		});
	};
}
