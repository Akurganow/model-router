import { readFile } from "node:fs/promises";
import type { RouteInput } from "./compose.ts";
import { type Facts, type Spawning, spawnCheck, TASK } from "./omp-items.ts";
import type { Context, Lookup, OmpImports, Pi } from "./omp-types.ts";
import { isRecord } from "./part.ts";
import {
	narrow,
	order,
	type Provider,
	type ProviderValue,
	plan,
} from "./provider.ts";
import { resolveScope, type Scope } from "./scope.ts";

export const ROLES = { small: "@smol", large: "@slow" } as const;

export const UNREADABLE = "settings unreadable";
// omp keys plugin settings by the package name.
export const PLUGIN = "model-router-omp";
const KEY_VARIABLES: Readonly<Record<Provider, string>> = {
	typesafe: "TYPESAFE_API_KEY",
	openrouter: "OPENROUTER_API_KEY",
};

export type Routing = Pick<RouteInput, "attempts" | "keys">;
export type Batch = Routing & { readonly facts: Facts };
export type Settings = {
	readonly provider: ProviderValue;
	readonly scope: Scope;
};
type Closed = { readonly closed: string };

// The spawn check needs the verdict alone. A spawn is judged like a batch item, for its own agent.
export async function checkGates(
	omp: OmpImports,
	pi: Pi,
	ctx: Context,
	spawning: Spawning = { agent: TASK },
): Promise<Routing | Closed> {
	const batch = await openBatch(omp, pi, ctx, await readSettings(omp, ctx.cwd));
	if ("closed" in batch) return batch;
	const reason = spawnCheck(spawning, batch.facts);
	return reason === undefined
		? { attempts: batch.attempts, keys: batch.keys }
		: { closed: reason };
}

// The gates that hold for the whole batch. Each fails closed, and the keys are the cheapest check.
// What each item needs to be judged comes back as facts, read once.
export async function openBatch(
	omp: OmpImports,
	pi: Pi,
	ctx: Context,
	settings: Settings | undefined,
): Promise<Batch | Closed> {
	if (settings === undefined) return { closed: UNREADABLE };
	const routing = await findKeys(ctx, settings.provider);
	if (routing.attempts.length === 0) return { closed: "key unset" };
	const config = readConfig(omp.lookup, pi.pi.settings);
	if (config === undefined) return { closed: UNREADABLE };
	const agents = await discover(pi, ctx);
	const noModels = modelsGate(ctx);
	return {
		...routing,
		facts: { ...config, scope: settings.scope, agents, noModels },
	};
}

// The effective settings hold the project's value when it sets one and the global value otherwise.
// A project may only narrow the provider, and its scope wins both ways. Unreadable settings give nothing.
export async function readSettings(
	omp: OmpImports,
	cwd: string,
): Promise<Settings | undefined> {
	try {
		const [global, effective] = await Promise.all([
			readGlobal(omp.getPluginsLockfile()),
			omp.getPluginSettings(PLUGIN, cwd),
		]);
		const { provider: fromGlobal } = global;
		const { provider: fromProject, scope } = effective;
		return {
			provider: narrow(fromGlobal, fromProject),
			scope: resolveScope(scope),
		};
	} catch {
		return undefined;
	}
}

// omp reads a missing lockfile as empty, and so does this.
async function readGlobal(path: string): Promise<Record<string, unknown>> {
	let text: string;
	try {
		text = await readFile(path, "utf8");
	} catch (err) {
		const { code } = isRecord(err) ? err : {};
		if (code === "ENOENT") return {};
		throw err;
	}
	const lock: unknown = JSON.parse(text);
	const { settings } = isRecord(lock) ? lock : {};
	const mine = isRecord(settings) ? settings[PLUGIN] : undefined;
	return isRecord(mine) ? mine : {};
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

export async function findKey(
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

type Config = Pick<Facts, "roles" | "overrides" | "disabled">;

function readConfig(lookup: Lookup, settings: unknown): Config | undefined {
	const roles = read(lookup, "modelRoles", settings);
	const overrides = read(lookup, "task.agentModelOverrides", settings);
	const disabled = read(lookup, "task.disabledAgents", settings);
	return isRecord(roles) && isRecord(overrides) && Array.isArray(disabled)
		? { roles, overrides, disabled }
		: undefined;
}

async function discover(pi: Pi, ctx: Context): Promise<Facts["agents"]> {
	try {
		return (await pi.pi.discoverAgents(ctx.cwd)).agents;
	} catch {
		return undefined;
	}
}

function modelsGate(ctx: Context): string | undefined {
	return Object.values(ROLES).some((role) => resolves(ctx, role))
		? undefined
		: `no ${ROLES.small} or ${ROLES.large} model`;
}
