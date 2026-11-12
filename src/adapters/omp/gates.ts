import { readFile } from "node:fs/promises";
import type { RouteInput } from "../../core/compose.ts";
import {
	KEY_VARIABLES,
	type Keys,
	narrow,
	order,
	type Provider,
	type ProviderValue,
	plan,
} from "../../core/provider.ts";
import { resolveScope, type Scope } from "../../core/scope.ts";
import { KEY_UNSET, UNREADABLE } from "../../core/settings.ts";
import { isRecord } from "../../utils/guards.ts";
import { nonEmpty } from "../../utils/text.ts";
import { type Facts, type Spawning, spawnCheck, TASK } from "./items.ts";
import { FALLBACK_NAME } from "./name.ts";
import type { Context, Lookup, OmpImports, Pi } from "./types.ts";

export const ROLES = { small: "@smol", large: "@slow" } as const;

export type Routing = Pick<RouteInput, "attempts" | "keys">;
export type Batch = Routing & { readonly facts: Facts };
export type Settings = {
	readonly provider: ProviderValue;
	readonly scope: Scope;
};
type Closed = { readonly closed: string };

// A spawn is judged like a batch item, for its own agent. Its effort needs the facts read again.
export async function checkGates(
	omp: OmpImports,
	pi: Pi,
	ctx: Context,
	spawning: Spawning = { agent: TASK },
): Promise<Batch | Closed> {
	const batch = await openBatch(omp, pi, ctx, await readSettings(omp, ctx.cwd));
	if ("closed" in batch) return batch;
	const reason = spawnCheck(spawning, batch.facts);
	return reason === undefined ? batch : { closed: reason };
}

/**
 * Returns the routing and the facts for the whole batch, or a closed reason
 * when a gate shuts it: unreadable settings, an unset key or an unreadable
 * config. Each gate fails closed, and the keys are the cheapest check. What
 * each item needs to be judged comes back as facts, read once. Never throws.
 */
export async function openBatch(
	omp: OmpImports,
	pi: Pi,
	ctx: Context,
	settings: Settings | undefined,
): Promise<Batch | Closed> {
	if (settings === undefined) return { closed: UNREADABLE };
	const routing = await findKeys(ctx, settings.provider);
	if (routing.attempts.length === 0) return { closed: KEY_UNSET };
	const config = readConfig(omp.lookup, pi.pi.settings);
	if (config === undefined) return { closed: UNREADABLE };
	const agents = await discover(pi, ctx);
	const noModels = modelsGate(ctx);
	return {
		...routing,
		facts: { ...config, scope: settings.scope, agents, noModels },
	};
}

/**
 * Returns the effective settings: the project's value when it sets one, and the
 * global value otherwise. A project may only narrow the provider, and its scope
 * wins both ways. Returns undefined when the settings are unreadable. When omp
 * gave no installed name, reads use the catalogue name. Writes still refuse, in
 * omp-config. Never throws.
 */
export async function readSettings(
	omp: OmpImports,
	cwd: string,
): Promise<Settings | undefined> {
	const plugin = omp.plugin ?? FALLBACK_NAME;
	try {
		const [global, effective] = await Promise.all([
			readGlobal(omp.getPluginsLockfile(), plugin),
			omp.getPluginSettings(plugin, cwd),
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

/**
 * Returns the plugin's entry in the lockfile at path. Returns an empty record
 * when the lockfile is missing, because omp reads a missing lockfile as empty,
 * and when the file holds no entry for the plugin. Throws on any other read
 * error and on invalid JSON.
 */
async function readGlobal(
	path: string,
	plugin: string,
): Promise<Record<string, unknown>> {
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
	const mine = isRecord(settings) ? settings[plugin] : undefined;
	return isRecord(mine) ? mine : {};
}

/**
 * Returns the attempts and the keys for the providers the value allows. Reads
 * only those providers. omp's own credential comes first, then the variable.
 * Returns no attempts when no key is set. Never throws.
 */
async function findKeys(ctx: Context, value: string): Promise<Routing> {
	const keys: Keys = {};
	for (const provider of order(value)) {
		const key = await findKey(ctx, provider);
		if (key !== undefined) keys[provider] = key;
	}
	return { attempts: plan(value, keys), keys };
}

/**
 * Returns the trimmed key of a provider: omp's own credential first, then the
 * provider's variable. Returns undefined when neither holds a non-blank value.
 * Never throws.
 */
export async function findKey(
	ctx: Context,
	provider: Provider,
): Promise<string | undefined> {
	try {
		const key = await ctx.modelRegistry.getApiKeyForProvider(provider);
		const trimmed = nonEmpty(key);
		if (trimmed !== undefined) return trimmed;
	} catch {
		// A broken credential store falls through to the variable.
	}
	return nonEmpty(process.env[KEY_VARIABLES[provider]]);
}

export function resolves(ctx: Context, role: string): boolean {
	try {
		return ctx.models.resolve(role) !== undefined;
	} catch {
		return false;
	}
}

// A read that throws gives the fallback.
function read(
	lookup: Lookup,
	id: string,
	settings: unknown,
	fallback?: unknown,
): unknown {
	try {
		return lookup(id)?.get(settings);
	} catch {
		return fallback;
	}
}

// omp reads this setting on every tool call and times out a tool_call handler that runs longer.
export const readTimeoutSetting = (
	lookup: Lookup,
	settings: unknown,
): unknown => read(lookup, "extensionHandlers.toolCallTimeoutMs", settings);

type Config = Pick<
	Facts,
	"roles" | "overrides" | "disabled" | "maxEffort" | "effortEnabled"
>;

// The effort settings close no gate. A ceiling that cannot be read reads as null, no omp value, so omp's effort stays.
// A per-task effort setting that is not true counts as off: omp still lets the item's effort win when it is on.
function readConfig(lookup: Lookup, settings: unknown): Config | undefined {
	const roles = read(lookup, "modelRoles", settings);
	const overrides = read(lookup, "task.agentModelOverrides", settings);
	const disabled = read(lookup, "task.disabledAgents", settings);
	const maxEffort = read(lookup, "task.maxEffort", settings, null);
	const effortEnabled = read(lookup, "task.enableEffort", settings) === true;
	return isRecord(roles) && isRecord(overrides) && Array.isArray(disabled)
		? { roles, overrides, disabled, maxEffort, effortEnabled }
		: undefined;
}

async function discover(pi: Pi, ctx: Context): Promise<Facts["agents"]> {
	try {
		return (await pi.pi.discoverAgents(ctx.cwd)).agents;
	} catch {
		return undefined;
	}
}

export const noModel = (role: string) => `no ${role} model`;

function modelsGate(ctx: Context): string | undefined {
	return Object.values(ROLES).some((role) => resolves(ctx, role))
		? undefined
		: noModel(`${ROLES.small} or ${ROLES.large}`);
}
