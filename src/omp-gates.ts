import { isRecord } from "./model.ts";
import type { Context, Lookup, Pi } from "./omp-types.ts";

export const ROLES = { small: "@smol", large: "@slow" } as const;

const KEY_PROVIDER = "typesafe";
const TASK = "task";
const BUNDLED = "bundled";

type Gates = { readonly key: string } | { readonly closed: string };

// The task agent and the user's own routing decide first. Each gate fails closed, and the key is the cheapest check.
export async function checkGates(
	lookup: Lookup,
	pi: Pi,
	ctx: Context,
): Promise<Gates> {
	const key = await findKey(ctx);
	if (key === undefined) return { closed: "key unset" };
	const closed =
		settingsGate(lookup, pi.pi.settings) ??
		(await agentGate(pi, ctx)) ??
		modelsGate(ctx);
	return closed === undefined ? { key } : { closed };
}

export function resolves(ctx: Context, role: string): boolean {
	try {
		return ctx.models.resolve(role) !== undefined;
	} catch {
		return false;
	}
}

// The key goes only to TypeSafe. omp's own credential comes first, then the variable.
async function findKey(ctx: Context): Promise<string | undefined> {
	try {
		const key = await ctx.modelRegistry.getApiKeyForProvider(KEY_PROVIDER);
		if (typeof key === "string" && key !== "") return key;
	} catch {
		// A broken credential store falls through to the variable.
	}
	const { TYPESAFE_API_KEY } = process.env;
	return TYPESAFE_API_KEY || undefined;
}

function read(lookup: Lookup, id: string, settings: unknown): unknown {
	try {
		return lookup(id)?.get(settings);
	} catch {
		return undefined;
	}
}

const isEmpty = (v: unknown) =>
	v === undefined || v === null || (typeof v === "string" && v.trim() === "");

function settingsGate(lookup: Lookup, settings: unknown): string | undefined {
	const roles = read(lookup, "modelRoles", settings);
	const overrides = read(lookup, "task.agentModelOverrides", settings);
	const disabled = read(lookup, "task.disabledAgents", settings);
	if (!isRecord(roles) || !isRecord(overrides) || !Array.isArray(disabled))
		return "settings unreadable";
	if (!isEmpty(roles[TASK])) return "task model role set";
	if (!isEmpty(overrides[TASK])) return "task model override set";
	if (disabled.includes(TASK)) return "task agent disabled";
	return undefined;
}

const CUSTOM_AGENT = "custom task agent";

async function agentGate(pi: Pi, ctx: Context): Promise<string | undefined> {
	try {
		const { agents } = await pi.pi.discoverAgents(ctx.cwd);
		const found = agents.find((agent) => agent.name === TASK);
		return found?.source === BUNDLED ? undefined : CUSTOM_AGENT;
	} catch {
		return CUSTOM_AGENT;
	}
}

function modelsGate(ctx: Context): string | undefined {
	return Object.values(ROLES).some((role) => resolves(ctx, role))
		? undefined
		: `no ${ROLES.small} or ${ROLES.large} model`;
}
