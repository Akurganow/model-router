import { DEFAULT_ROLE, NO_DESCRIPTION, roleText } from "./brief.ts";
import { findAgent, sameAgent } from "./openclaw-agents.ts";
import { isSet, type SpawnRequest } from "./openclaw-params.ts";
import type { OpenClawSettings } from "./openclaw-settings.ts";
import type { OpenClawConfig } from "./openclaw-types.ts";
import { isRecord, nonEmpty } from "./part.ts";
import {
	agentDiscoveryFailed,
	agentUnknown,
	KEY_UNSET,
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
			// The spawn's label, else its task name, else empty.
			readonly description: string;
	  };

export type GateInput = {
	readonly spawn: SpawnRequest;
	readonly requester: string | undefined;
	// Undefined when the live config could not be read.
	readonly config: OpenClawConfig | undefined;
	readonly settings: OpenClawSettings;
	// True when a key is set for any provider the settings allow.
	readonly hasKey: boolean;
};

const PASS: Gate = { outcome: "pass" };
const skip = (reason: string): Gate => ({ outcome: "skip", reason });
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

const agentField = (
	config: OpenClawConfig | undefined,
	id: string | undefined,
	...path: string[]
) => at(findAgent(config, id), ...path);

// OpenClaw's `normalizeToolModelOverride`: trimmed text, where "default" in any case names no model.
const namesModel = (model: string | undefined): boolean =>
	model !== undefined && model.toLowerCase() !== NO_MODEL_VALUE;

// Claude Code passes these calls through, and so does the router.
function passesSilently(spawn: SpawnRequest): boolean {
	return (
		namesModel(spawn.model) ||
		spawn.runtime === "other" ||
		spawn.agent.kind === "invalid" ||
		spawn.visible ||
		spawn.context === "fork" ||
		spawn.mode === "session" ||
		spawn.thread
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
	const { spawn, config, requester, settings } = input;
	if (spawn.thinking !== undefined)
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

// A blank description gives the role of an agent with none: the harness default for the requester, else the neutral line.
function roleOf(input: GateInput, target: string | undefined, blank: string) {
	const description = agentField(input.config, target, "description");
	return nonEmpty(description) === undefined ? blank : roleText(description);
}

// Order: plugins/model-router-openclaw/README.md#which-spawns-are-routed. Change both.
export function gateSpawn(input: GateInput): Gate {
	const { spawn, requester, settings, config } = input;
	const { task } = spawn;
	if (task === undefined || passesSilently(spawn)) return PASS;
	const named = spawn.agent.kind === "id" ? spawn.agent.id : undefined;
	// "The spawn of the requesting agent itself": no agent id, or the requester's own id.
	const isRequesterSpawn =
		named === undefined ||
		(requester !== undefined && sameAgent(named, requester));
	const target = isRequesterSpawn ? requester : named;
	if (!input.hasKey) return skip(KEY_UNSET);
	if (!isRequesterSpawn && settings.scope === "core")
		return skip(outsideCoreScope(named));
	if (subagentModelSet(input, target)) return skip("subagent model set");
	if (!isRequesterSpawn) {
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
		role: roleOf(
			input,
			target,
			isRequesterSpawn ? DEFAULT_ROLE : NO_DESCRIPTION,
		),
		effort: effortRule(input),
		config,
		task,
		description: spawn.description,
	};
}
