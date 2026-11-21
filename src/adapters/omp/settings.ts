import { readFile } from "node:fs/promises";
import { type Stored, valueFor } from "#core/options/settings.ts";
import {
	type Attempt,
	type Choice,
	collectKeys,
	type Gateway,
	KEY_VARIABLES,
	type KeyHolder,
	plan,
} from "#core/providers/provider.ts";
import { isRecord } from "#utils/guards.ts";
import { nonEmpty } from "#utils/text.ts";
import type { Facts } from "./items.ts";
import { FALLBACK_NAME } from "./name.ts";
import type { Context, Lookup, OmpImports } from "./types.ts";

// A gateway value a project may narrow, and the single-path values it narrows to.
const NARROWABLE: readonly Gateway[] = ["auto", "openrouter-first"];
const SINGLE_PATH: readonly Gateway[] = ["direct", "openrouter"];

const namesNoValue = (
	setting: "provider" | "gateway",
	text: unknown,
): boolean => valueFor(setting, text) === undefined;

/**
 * Returns the stored text the plugin applies for each setting, from the global
 * text and the effective one (a project's over the global). A project file comes
 * with a checkout, so it never changes who scores, and it may only drop a path
 * from a global gateway, never add, swap or reorder one: it cannot send a
 * request where the user did not allow it. A text that is not valid always
 * passes through, so the core skips routing and the report shows it.
 */
function applied(
	global: Record<string, unknown>,
	effective: Record<string, unknown>,
): Stored {
	const { provider: fromGlobal, gateway: gatewayFromGlobal } = global;
	const { provider, gateway, scope } = effective;
	return {
		provider: namesNoValue("provider", provider) ? provider : fromGlobal,
		gateway: gatewayText(gatewayFromGlobal, gateway),
		scope,
	};
}

function gatewayText(global: unknown, effective: unknown): unknown {
	if (namesNoValue("gateway", effective)) return effective;
	if (namesNoValue("gateway", global)) return global;
	// Compares the stored texts, not their values: a blank text reads as direct and would narrow auto.
	const narrows =
		NARROWABLE.some((value) => value === global) &&
		SINGLE_PATH.some((value) => value === effective);
	return narrows ? effective : global;
}

/**
 * Returns the stored text the plugin applies for each setting, unchecked: the
 * core decides whether a text is valid. Returns undefined when the settings are
 * unreadable. When omp gave no installed name, reads use the catalogue name.
 * Writes still refuse, in omp/config.ts. Never throws.
 */
export async function readSettings(
	omp: OmpImports,
	cwd: string,
): Promise<Stored | undefined> {
	const plugin = omp.plugin ?? FALLBACK_NAME;
	try {
		const [global, effective] = await Promise.all([
			readGlobal(omp.getPluginsLockfile(), plugin),
			omp.getPluginSettings(plugin, cwd),
		]);
		return applied(global, effective);
	} catch {
		return undefined;
	}
}

/**
 * Returns the stored text of each setting in the global settings alone, without
 * a project's value. A write replaces the global text, so the test for "already"
 * needs that text. Returns undefined when it cannot be read. When omp gave no
 * installed name, reads use the catalogue name. Never throws.
 */
export async function readGlobalSettings(
	omp: OmpImports,
): Promise<Stored | undefined> {
	const plugin = omp.plugin ?? FALLBACK_NAME;
	try {
		const { provider, gateway, scope } = await readGlobal(
			omp.getPluginsLockfile(),
			plugin,
		);
		return { provider, gateway, scope };
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
 * Returns the attempts, each with its key, for the key holders the choice asks. Reads
 * only those key holders. omp's own credential comes first, then the variable.
 * Returns no attempts when no key is set. Never throws.
 */
export async function findAttempts(
	ctx: Context,
	choice: Choice,
): Promise<Attempt[]> {
	const keys = await collectKeys(choice, (holder) => findKey(ctx, holder));
	return plan(choice, keys);
}

/**
 * Returns the trimmed key of a key holder: omp's own credential first, then the
 * key holder's variable. Returns undefined when neither holds a non-blank value.
 * Never throws.
 */
export async function findKey(
	ctx: Context,
	holder: KeyHolder,
): Promise<string | undefined> {
	try {
		const key = await ctx.modelRegistry.getApiKeyForProvider(holder);
		const trimmed = nonEmpty(key);
		if (trimmed !== undefined) return trimmed;
	} catch {
		// A broken credential store falls through to the variable.
	}
	return nonEmpty(process.env[KEY_VARIABLES[holder]]);
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
