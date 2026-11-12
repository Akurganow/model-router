import { readFile } from "node:fs/promises";
import type { RouteInput } from "../../core/compose.ts";
import {
	collectKeys,
	KEY_VARIABLES,
	type Provider,
	type ProviderValue,
	plan,
	resolve as resolveProvider,
} from "../../core/provider.ts";
import { resolveScope, type Scope } from "../../core/scope.ts";
import { isRecord } from "../../utils/guards.ts";
import { nonEmpty } from "../../utils/text.ts";
import type { Facts } from "./items.ts";
import { FALLBACK_NAME } from "./name.ts";
import type { Context, Lookup, OmpImports } from "./types.ts";

const NARROWABLE: readonly ProviderValue[] = ["auto", "openrouter-first"];

export type Routing = Pick<RouteInput, "attempts" | "keys">;
export type Settings = {
	readonly provider: ProviderValue;
	readonly scope: Scope;
};

// A project may only drop one provider from a two-provider global value, never swap, add or reorder.
export function narrow(global: unknown, project: unknown): ProviderValue {
	const value = resolveProvider(global);
	return NARROWABLE.includes(value) &&
		(project === "typesafe" || project === "openrouter")
		? project
		: value;
}

/**
 * Returns the effective settings: the project's value when it sets one, and the
 * global value otherwise. A project may only narrow the provider, and its scope
 * wins both ways. Returns undefined when the settings are unreadable. When omp
 * gave no installed name, reads use the catalogue name. Writes still refuse, in
 * omp/config.ts. Never throws.
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
export async function findKeys(ctx: Context, value: string): Promise<Routing> {
	const keys = await collectKeys(value, (provider) => findKey(ctx, provider));
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
export function readConfig(
	lookup: Lookup,
	settings: unknown,
): Config | undefined {
	const roles = read(lookup, "modelRoles", settings);
	const overrides = read(lookup, "task.agentModelOverrides", settings);
	const disabled = read(lookup, "task.disabledAgents", settings);
	const maxEffort = read(lookup, "task.maxEffort", settings, null);
	const effortEnabled = read(lookup, "task.enableEffort", settings) === true;
	return isRecord(roles) && isRecord(overrides) && Array.isArray(disabled)
		? { roles, overrides, disabled, maxEffort, effortEnabled }
		: undefined;
}
