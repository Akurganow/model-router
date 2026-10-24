import { readFile } from "node:fs/promises";
import { roleText } from "./brief.ts";
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
export type Scoped = Routing & { readonly role: string };
type Closed = { readonly closed: string };

// The spawn check needs the verdict alone.
export async function checkGates(
	omp: OmpImports,
	pi: Pi,
	ctx: Context,
): Promise<Routing | Closed> {
	const gates = await scopeGates(omp, pi, ctx);
	if ("closed" in gates) return gates;
	return { attempts: gates.attempts, keys: gates.keys };
}

// The task agent and the user's own routing decide first. Each gate fails closed, and the keys are the cheapest check.
// The one discovery call also gives the task agent's description, which becomes the role of every request.
export async function scopeGates(
	omp: OmpImports,
	pi: Pi,
	ctx: Context,
): Promise<Scoped | Closed> {
	let value: string;
	try {
		value = await readProvider(omp, ctx.cwd);
	} catch {
		return { closed: UNREADABLE };
	}
	const routing = await findKeys(ctx, value);
	if (routing.attempts.length === 0) return { closed: "key unset" };
	const settingsClosed = settingsGate(omp.lookup, pi.pi.settings);
	if (settingsClosed !== undefined) return { closed: settingsClosed };
	const agent = await findTaskAgent(pi, ctx);
	if ("closed" in agent) return agent;
	const modelsClosed = modelsGate(ctx);
	if (modelsClosed !== undefined) return { closed: modelsClosed };
	return { ...routing, role: roleText(agent.description) };
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

async function findTaskAgent(
	pi: Pi,
	ctx: Context,
): Promise<Closed | { readonly description: unknown }> {
	try {
		const { agents } = await pi.pi.discoverAgents(ctx.cwd);
		const found = agents.find((agent) => agent.name === TASK);
		return found?.source === BUNDLED
			? { description: found.description }
			: { closed: CUSTOM_AGENT };
	} catch {
		return { closed: CUSTOM_AGENT };
	}
}

function modelsGate(ctx: Context): string | undefined {
	return Object.values(ROLES).some((role) => resolves(ctx, role))
		? undefined
		: `no ${ROLES.small} or ${ROLES.large} model`;
}
