import { readFile } from "node:fs/promises";
import type { RouteInput } from "./compose.ts";
import type { Context, Lookup, OmpImports, Pi } from "./omp-types.ts";
import { isRecord } from "./part.ts";
import { narrow, order, type Provider, plan } from "./provider.ts";

export const ROLES = { small: "@smol", large: "@slow" } as const;

const TASK = "task";
const BUNDLED = "bundled";
const UNREADABLE = "settings unreadable";
// omp keys plugin settings by the package name.
const PLUGIN = "model-router-omp";
const SETTING = "provider";
const KEY_VARIABLES: Readonly<Record<Provider, string>> = {
	typesafe: "TYPESAFE_API_KEY",
	openrouter: "OPENROUTER_API_KEY",
};

export type Routing = Pick<RouteInput, "attempts" | "keys">;
type Gates = Routing | { readonly closed: string };

// The task agent and the user's own routing decide first. Each gate fails closed, and the keys are the cheapest check.
export async function checkGates(
	omp: OmpImports,
	pi: Pi,
	ctx: Context,
): Promise<Gates> {
	let value: string;
	try {
		value = await readProvider(omp, ctx.cwd);
	} catch {
		return { closed: UNREADABLE };
	}
	const routing = await findKeys(ctx, value);
	if (routing.attempts.length === 0) return { closed: "key unset" };
	const closed =
		settingsGate(omp.lookup, pi.pi.settings) ??
		(await agentGate(pi, ctx)) ??
		modelsGate(ctx);
	return closed === undefined ? routing : { closed };
}

// The effective settings hold the project's value when it sets one and the global value otherwise.
async function readProvider(omp: OmpImports, cwd: string): Promise<string> {
	const [global, effective] = await Promise.all([
		readGlobal(omp.getPluginsLockfile()),
		omp.getPluginSettings(PLUGIN, cwd),
	]);
	return narrow(global, effective[SETTING]);
}

// omp reads a missing lockfile as empty, and so does this.
async function readGlobal(path: string): Promise<unknown> {
	let text: string;
	try {
		text = await readFile(path, "utf8");
	} catch (err) {
		const { code } = isRecord(err) ? err : {};
		if (code === "ENOENT") return undefined;
		throw err;
	}
	const lock: unknown = JSON.parse(text);
	const { settings } = isRecord(lock) ? lock : {};
	const mine = isRecord(settings) ? settings[PLUGIN] : undefined;
	return isRecord(mine) ? mine[SETTING] : undefined;
}

// Only the providers the value allows are read. omp's own credential comes first, then the variable.
async function findKeys(ctx: Context, value: string): Promise<Routing> {
	const keys: Partial<Record<Provider, string>> = {};
	for (const provider of order(value)) {
		const key = await findKey(ctx, provider);
		if (key !== undefined) keys[provider] = key;
	}
	const present = {
		typesafe: keys.typesafe !== undefined,
		openrouter: keys.openrouter !== undefined,
	};
	return { attempts: plan(value, present), keys };
}

async function findKey(
	ctx: Context,
	provider: Provider,
): Promise<string | undefined> {
	try {
		const key = await ctx.modelRegistry.getApiKeyForProvider(provider);
		if (typeof key === "string" && key !== "") return key;
	} catch {
		// A broken credential store falls through to the variable.
	}
	return process.env[KEY_VARIABLES[provider]] || undefined;
}

export function resolves(ctx: Context, role: string): boolean {
	try {
		return ctx.models.resolve(role) !== undefined;
	} catch {
		return false;
	}
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
		return UNREADABLE;
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
