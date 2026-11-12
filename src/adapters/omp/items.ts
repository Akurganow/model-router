import { DEFAULT_ROLE, roleText } from "../../core/brief.ts";
import {
	agentDiscoveryFailed,
	agentUnknown,
	outsideCoreScope,
	setsOwnModel,
} from "../../core/reasons.ts";
import type { Scope } from "../../core/scope.ts";
import { isSet } from "../../utils/guards.ts";
import type { DiscoveredAgent } from "./types.ts";

export const TASK = "task";
const BUNDLED = "bundled";
export const ROLE_MARK = "@";
// omp 18.12.6 sends the bundled seance agent no before_subagent_spawn event, so a role cannot reach it.
const SEANCE = "seance";
const CUSTOM_AGENT = "custom task agent";

// What one batch reads once and judges every item against. No agents means discovery failed.
export type Facts = {
	readonly scope: Scope;
	readonly roles: Readonly<Record<string, unknown>>;
	readonly overrides: Readonly<Record<string, unknown>>;
	readonly disabled: readonly unknown[];
	readonly agents: readonly DiscoveredAgent[] | undefined;
	readonly noModels: string | undefined;
	// Undefined when omp has no such setting, and null when its read throws. omp does not cap a level the spawn hook sets.
	readonly maxEffort: unknown;
	// omp passes an item's `effort` on only while `task.enableEffort` is true.
	readonly effortEnabled: boolean;
};

export type Spawning = {
	readonly agent: string;
	readonly modelRole?: string | undefined;
};

export const inScope = (name: string, scope: Scope) =>
	scope === "extended" || name === TASK;

const findAgent = (name: string, { agents }: Facts) =>
	agents?.find((agent) => agent.name === name);

// The first declared model that names a role. An agent without one has no role of its own.
const ownRole = (agent: DiscoveredAgent | undefined) =>
	agent?.model
		?.find((model) => model.startsWith(ROLE_MARK))
		?.slice(ROLE_MARK.length);

// A model the user set is never overridden. A bundled agent's own model is not a user choice.
function userChoice(name: string, facts: Facts): string | undefined {
	if (name === TASK && isSet(facts.roles[TASK])) return "task model role set";
	if (Object.hasOwn(facts.overrides, name) && isSet(facts.overrides[name]))
		return `${name} model override set`;
	if (facts.disabled.includes(name)) return `${name} agent disabled`;
	return undefined;
}

/**
 * Returns the reason to skip an agent, or undefined when the agent may be
 * routed. A bundled agent passes. Any other agent is skipped in the core scope,
 * when discovery failed, when the agent is unknown, or when it sets its own
 * model. Never throws.
 */
function agentGate(name: string, facts: Facts): string | undefined {
	const found = findAgent(name, facts);
	if (found?.source === BUNDLED) return undefined;
	if (facts.scope === "core") return CUSTOM_AGENT;
	if (facts.agents === undefined) return agentDiscoveryFailed(name);
	if (found === undefined) return agentUnknown(name);
	return found.model?.length ? setsOwnModel(name) : undefined;
}

const seanceGate = (name: string) =>
	name === SEANCE
		? `${name} spawns without the hook omp gives plugins, so its model cannot change`
		: undefined;

// The batch reads the tool input, because the spawn event's patterns hold the agent's default when the item sets no model.
// Source: docs/clients.md#omp-per-call-model.
const modelGate = (model: unknown) =>
	model === undefined ? undefined : setsOwnModel("the item");

/**
 * Judges one item alone and returns the reason to skip it, or undefined when it
 * may be routed. A scope, a user choice, the seance gate, the item's own model,
 * the agent gate or a missing model role gives the reason, in that order. Never
 * throws. The batch drops out-of-scope items before it judges them, so the
 * scope check acts at spawn time: after a switch to the core scope, it skips a
 * bundled agent that the agent gate would pass.
 */
export function itemCheck(
	name: string,
	facts: Facts,
	model?: unknown,
): string | undefined {
	if (!inScope(name, facts.scope)) return outsideCoreScope(name);
	return (
		userChoice(name, facts) ??
		seanceGate(name) ??
		modelGate(model) ??
		agentGate(name, facts) ??
		facts.noModels
	);
}

// A spawn that names a role other than the agent's own is the user's or the harness's choice.
// It passes no model: an item skipped for its model stores no role, so onSpawn returns before checkGates.
export function spawnCheck(
	{ agent, modelRole }: Spawning,
	facts: Facts,
): string | undefined {
	const reason = itemCheck(agent, facts);
	if (reason !== undefined) return reason;
	return modelRole && modelRole !== ownRole(findAgent(agent, facts))
		? `${agent} spawns with another model role`
		: undefined;
}

/**
 * Only omp's bundled task agent sends the fixed role. A user or project agent under that name sends its own description.
 */
export function roleOf(name: string, facts: Facts): string {
	const found = findAgent(name, facts);
	return name === TASK && found?.source === BUNDLED
		? DEFAULT_ROLE
		: roleText(found?.description);
}
