import { DEFAULT_ROLE, roleText } from "./brief.ts";
import { findAgent, sameAgent } from "./openclaw-agents.ts";
import { readParam, readStringParam } from "./openclaw-params.ts";
import type { OpenClawSettings } from "./openclaw-settings.ts";
import type { OpenClawConfig, SpawnParams } from "./openclaw-types.ts";
import { isRecord, nonEmpty } from "./part.ts";
import {
	agentDiscoveryFailed,
	agentUnknown,
	outsideCoreScope,
	setsOwnModel,
	UNREADABLE,
} from "./settings.ts";

export type EffortRule =
	| { readonly kind: "set" }
	| {
			readonly kind: "keep";
			readonly label: "caller effort" | "config effort";
	  };

// A spawn passes silently, is skipped with a reason, or is routed for its target agent with this role and effort rule.
export type Gate =
	| { readonly outcome: "pass" }
	| { readonly outcome: "skip"; readonly reason: string }
	| {
			readonly outcome: "route";
			// Unset when the spawn is the requesting agent itself and the context names no requester.
			readonly target: string | undefined;
			readonly role: string;
			readonly effort: EffortRule;
			// The live config the checks read. A route has one, because the gate skips an unreadable config.
			readonly config: OpenClawConfig;
			readonly task: string;
	  };

export type GateInput = {
	readonly params: SpawnParams;
	readonly requester: string | undefined;
	// Undefined when the live config could not be read.
	readonly config: OpenClawConfig | undefined;
	readonly settings: OpenClawSettings;
	// True when a key is set for any provider the settings allow.
	readonly hasKey: boolean;
};

const PASS: Gate = { outcome: "pass" };
const skip = (reason: string): Gate => ({ outcome: "skip", reason });
const SUBAGENT_RUNTIME = "subagent";
const NO_MODEL_VALUE = "default";

// OpenClaw's config is user-written JSON, so every step down it is checked.
function at(value: unknown, ...path: string[]): unknown {
	let node = value;
	for (const key of path) {
		if (!isRecord(node) || !Object.hasOwn(node, key)) return undefined;
		node = node[key];
	}
	return node;
}

// Config values may be objects, such as a model with fallbacks, so only text is checked for blankness.
const isSet = (v: unknown): boolean =>
	typeof v === "string"
		? nonEmpty(v) !== undefined
		: v !== undefined && v !== null;

const agentField = (
	config: OpenClawConfig | undefined,
	id: string | undefined,
	...path: string[]
) => at(findAgent(config, id), ...path);

// OpenClaw's `normalizeToolModelOverride`: trimmed text, where "default" in any case names no model.
function namesModel(params: SpawnParams): boolean {
	const model = readStringParam(params, "model");
	return model !== undefined && model.toLowerCase() !== NO_MODEL_VALUE;
}

// Claude Code passes these calls through, and so does the router.
function passesSilently(params: SpawnParams): boolean {
	const { runtime } = params;
	const agentId = readParam(params, "agentId");
	return (
		namesModel(params) ||
		(isSet(runtime) && runtime !== SUBAGENT_RUNTIME) ||
		(isSet(agentId) && typeof agentId !== "string") ||
		params.visible === true ||
		params.context === "fork" ||
		params.mode === "session" ||
		params.thread === true
	);
}

function otherAgentSkip(id: string, { config }: GateInput): string | undefined {
	if (config === undefined) return agentDiscoveryFailed(id);
	const entry = findAgent(config, id);
	if (entry === undefined) return agentUnknown(id);
	return isSet(at(entry, "model")) ? setsOwnModel(id) : undefined;
}

function subagentModelSet(input: GateInput, target: string | undefined) {
	return (
		isSet(agentField(input.config, target, "subagents", "model")) ||
		isSet(at(input.config, "agents", "defaults", "subagents", "model"))
	);
}

// The first match decides. Under extended the requester's or target's own value is replaced, which is the ladder effort too.
function effortRule(input: GateInput): EffortRule {
	const { params, config, requester, settings } = input;
	if (readStringParam(params, "thinking") !== undefined)
		return { kind: "keep", label: "caller effort" };
	const global = at(config, "agents", "defaults", "subagents", "thinking");
	const requesterThinking = agentField(
		config,
		requester,
		"subagents",
		"thinking",
	);
	const kept =
		isSet(global) || (settings.scope === "core" && isSet(requesterThinking));
	return kept ? { kind: "keep", label: "config effort" } : { kind: "set" };
}

function roleOf(input: GateInput, target: string | undefined, own: boolean) {
	const description = agentField(input.config, target, "description");
	if (!own) return roleText(description);
	return nonEmpty(description) === undefined
		? DEFAULT_ROLE
		: roleText(description);
}

// Order: plugins/model-router-openclaw/README.md#which-spawns-are-routed. Change both.
export function gateSpawn(input: GateInput): Gate {
	const { params, requester, settings, config } = input;
	const { task } = params;
	if (typeof task !== "string" || passesSilently(params)) return PASS;
	const named = readStringParam(params, "agentId");
	// "The spawn of the requesting agent itself": no agent id, or the requester's own id.
	const own =
		named === undefined ||
		(requester !== undefined && sameAgent(named, requester));
	const target = own ? requester : named;
	// omp's order: the key gate, the scope, the user's own model choice, the agent, the model slots.
	if (!input.hasKey) return skip("key unset");
	if (!own && settings.scope === "core") return skip(outsideCoreScope(named));
	if (subagentModelSet(input, target)) return skip("subagent model set");
	if (!own) {
		const reason = otherAgentSkip(named, input);
		if (reason !== undefined) return skip(reason);
	}
	if (settings.smallModel === undefined && settings.largeModel === undefined)
		return skip("no small or large model");
	// Without the config the user's own subagent model and effort cannot be checked.
	if (config === undefined) return skip(UNREADABLE);
	return {
		outcome: "route",
		target,
		role: roleOf(input, target, own),
		effort: effortRule(input),
		config,
		task,
	};
}
