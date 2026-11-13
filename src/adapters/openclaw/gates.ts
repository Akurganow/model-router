import { DEFAULT_ROLE, NO_DESCRIPTION, roleText } from "../../core/brief.ts";
import {
	agentDiscoveryFailed,
	agentUnknown,
	CALLER_EFFORT,
	CONFIG_EFFORT,
	KEY_UNSET,
	NO_END_MODEL,
	outsideCoreScope,
	SUBAGENT_MODEL_SET,
	setsOwnModel,
	UNREADABLE,
} from "../../core/reasons.ts";
import { isRecord, isSet } from "../../utils/guards.ts";
import { nonEmpty } from "../../utils/text.ts";
import { findAgent, sameAgent } from "./agents.ts";
import type { SpawnRequest } from "./params.ts";
import type { OpenClawSettings } from "./settings.ts";
import type { OpenClawConfig } from "./types.ts";

type EffortRule =
	| { readonly kind: "set" }
	| {
			readonly kind: "keep";
			readonly label: typeof CALLER_EFFORT | typeof CONFIG_EFFORT;
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

/**
 * Returns the value at the path inside a value, or undefined when a step is not
 * an own key of a record. OpenClaw's config is user-written JSON, so every step
 * down it is checked. Never throws.
 */
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

/**
 * Tells whether a spawn's model names a model: false when undefined or when it
 * reads "default" in any case. OpenClaw's `normalizeToolModelOverride` gives the
 * same reading of the trimmed text. Never throws.
 */
const namesModel = (model: string | undefined): boolean =>
	model !== undefined && model.toLowerCase() !== NO_MODEL_VALUE;

/**
 * Tells whether the router passes the spawn through without a skip reason: it
 * names a model, uses another runtime or an invalid agent, is visible, forks the
 * context, opens a session or starts a thread. Claude Code passes these calls
 * through, and so does the router. Never throws.
 */
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

/**
 * Returns why a spawn of another agent is skipped: the config is unreadable, the
 * config lacks the agent, or the agent sets its own model. Returns undefined
 * when the spawn may route. Never throws.
 */
function otherAgentSkip(id: string, { config }: GateInput): string | undefined {
	if (config === undefined) return agentDiscoveryFailed(id);
	const entry = findAgent(config, id);
	if (entry === undefined) return agentUnknown(id);
	return isSet(at(entry, "model")) ? setsOwnModel(id) : undefined;
}

/**
 * Tells whether the user already set a subagent model, for the target agent or
 * in the defaults. Never throws.
 */
function subagentModelSet(input: GateInput, target: string | undefined) {
	return (
		isSet(agentField(input.config, target, "subagents", "model")) ||
		isSet(at(input.config, "agents", "defaults", "subagents", "model"))
	);
}

/**
 * Returns whether the router keeps the effort or sets it. The effort stays when
 * the spawn sets thinking, when the defaults set it, or under core scope when
 * the requester sets it. The first match decides. Under extended the requester's
 * or target's own value is replaced, which is the ladder effort too. Never
 * throws.
 */
function effortRule(input: GateInput): EffortRule {
	const { spawn, config, requester, settings } = input;
	if (spawn.thinking !== undefined)
		return { kind: "keep", label: CALLER_EFFORT };
	const global = at(config, "agents", "defaults", "subagents", "thinking");
	const requesterThinking = agentField(
		config,
		requester,
		"subagents",
		"thinking",
	);
	const kept =
		isSet(global) || (settings.scope === "core" && isSet(requesterThinking));
	return kept ? { kind: "keep", label: CONFIG_EFFORT } : { kind: "set" };
}

/**
 * Returns the role text built from the target agent's description, or `blank`
 * when the description is blank. A blank description gives the role of an agent
 * with none: the harness default for the requester, else the neutral line. Never
 * throws.
 */
function roleOf(input: GateInput, target: string | undefined, blank: string) {
	const description = agentField(input.config, target, "description");
	return nonEmpty(description) === undefined ? blank : roleText(description);
}

/**
 * Returns the gate outcome of a spawn: pass for a spawn without a task or one
 * that passes silently, skip with a reason, or route with its target, role,
 * effort rule, config, task and description. The first failing check decides.
 * Never throws. Order: plugins/model-router-openclaw/README.md#which-spawns-are-routed.
 * Change both.
 */
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
	if (subagentModelSet(input, target)) return skip(SUBAGENT_MODEL_SET);
	if (!isRequesterSpawn) {
		const reason = otherAgentSkip(named, input);
		if (reason !== undefined) return skip(reason);
	}
	if (settings.smallModel === undefined && settings.largeModel === undefined)
		return skip(NO_END_MODEL);
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
