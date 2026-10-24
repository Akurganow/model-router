import { roleText } from "./brief.ts";
import type { DiscoveredAgent } from "./omp-types.ts";
import type { Scope } from "./scope.ts";

export const TASK = "task";
const BUNDLED = "bundled";
const ROLE_MARK = "@";
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
};

export type Spawning = {
	readonly agent: string;
	readonly modelRole?: string | undefined;
};

const isEmpty = (v: unknown) =>
	v === undefined || v === null || (typeof v === "string" && v.trim() === "");

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
	if (name === TASK && !isEmpty(facts.roles[TASK]))
		return "task model role set";
	if (Object.hasOwn(facts.overrides, name) && !isEmpty(facts.overrides[name]))
		return `${name} model override set`;
	if (facts.disabled.includes(name)) return `${name} agent disabled`;
	return undefined;
}

function agentGate(name: string, facts: Facts): string | undefined {
	const found = findAgent(name, facts);
	if (found?.source === BUNDLED) return undefined;
	if (facts.scope === "core") return CUSTOM_AGENT;
	if (facts.agents === undefined) return `${name} agent discovery failed`;
	if (found === undefined) return `${name} agent unknown`;
	return found.model?.length ? `${name} sets its own model` : undefined;
}

const seanceGate = (name: string) =>
	name === SEANCE
		? `${name} spawns without the hook omp gives plugins, so its model cannot change`
		: undefined;

// One rule judges every item alone: a reason to skip it, or nothing.
export function itemCheck(name: string, facts: Facts): string | undefined {
	if (!inScope(name, facts.scope)) return `${name} is outside the core scope`;
	return (
		userChoice(name, facts) ??
		seanceGate(name) ??
		agentGate(name, facts) ??
		facts.noModels
	);
}

// A spawn that names a role other than the agent's own is the user's or the harness's choice.
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

export const roleOf = (name: string, facts: Facts) =>
	roleText(findAgent(name, facts)?.description);
