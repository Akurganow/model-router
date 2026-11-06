import type { OpenClawApi, OpenClawConfig } from "./openclaw-types.ts";
import { isRecord, nonEmpty } from "./part.ts";
import {
	KEY_FIELDS,
	KEY_VARIABLES,
	type Keys,
	order,
	type ProviderValue,
	parseProvider,
	resolve,
} from "./provider.ts";
import { parseScope, resolveScope, type Scope } from "./scope.ts";

export const PLUGIN_ID = "model-router-openclaw";

export type OpenClawSettings = {
	readonly provider: ProviderValue;
	readonly scope: Scope;
	readonly smallModel: string | undefined;
	readonly largeModel: string | undefined;
};
export type Environment = Readonly<Record<string, string | undefined>>;
type Settings = Record<string, unknown>;

type PluginEntry = NonNullable<
	NonNullable<OpenClawConfig["plugins"]>["entries"]
>[string];

/** The plugin's own entry in the config: its hook timeouts and its settings. */
export const pluginEntry = (
	config: OpenClawConfig | undefined,
): PluginEntry | undefined => config?.plugins?.entries?.[PLUGIN_ID];

/** Stores one setting in the plugin's entry of a config draft and keeps everything else in it. */
export function withPluginSetting(
	draft: OpenClawConfig,
	setting: string,
	value: string,
): void {
	const plugins = draft.plugins ?? {};
	const entries = plugins.entries ?? {};
	const entry = entries[PLUGIN_ID] ?? {};
	const config: Settings = entry.config ?? {};
	config[setting] = value;
	draft.plugins = {
		...plugins,
		entries: { ...entries, [PLUGIN_ID]: { ...entry, config } },
	};
}

// The live config holds a command's write. The plugin config is what OpenClaw read at start-up.
function sources(
	live: OpenClawConfig | undefined,
	pluginConfig: Settings | undefined,
): readonly Settings[] {
	return [pluginEntry(live)?.config, pluginConfig].filter(isRecord);
}

/**
 * Returns the first value that `parse` accepts from the field of each source, in
 * order, or undefined when none does. A source whose value does not parse counts
 * as silent, so a later source can still supply the setting. Throws only when
 * `parse` throws.
 */
function firstValid<T>(
	from: readonly Settings[],
	field: string,
	parse: (value: unknown) => T | undefined,
): T | undefined {
	for (const settings of from) {
		const parsed = parse(settings[field]);
		if (parsed !== undefined) return parsed;
	}
	return undefined;
}

/**
 * Returns the live config, or undefined when the runtime cannot read it. Never
 * throws.
 */
function readLive(api: OpenClawApi): OpenClawConfig | undefined {
	try {
		return api.runtime.config.current();
	} catch {
		return undefined;
	}
}

export function readSettings(
	live: OpenClawConfig | undefined,
	pluginConfig: Settings | undefined,
): OpenClawSettings {
	const from = sources(live, pluginConfig);
	return {
		provider: resolve(firstValid(from, "provider", parseProvider)),
		scope: resolveScope(firstValid(from, "scope", parseScope)),
		smallModel: firstValid(from, "small_model", nonEmpty),
		largeModel: firstValid(from, "large_model", nonEmpty),
	};
}

/**
 * Returns the Jev keys of the providers the value allows, each from a source
 * field or else from its environment variable. A provider with no key is
 * absent. OpenClaw's own provider credentials are never Jev keys. Throws only
 * when a source getter throws.
 */
export function readKeys(
	live: OpenClawConfig | undefined,
	pluginConfig: Settings | undefined,
	providerValue: unknown,
	env: Environment,
): Keys {
	const from = sources(live, pluginConfig);
	const keys: Keys = {};
	for (const provider of order(providerValue)) {
		const key =
			firstValid(from, KEY_FIELDS[provider], nonEmpty) ??
			nonEmpty(env[KEY_VARIABLES[provider]]);
		if (key !== undefined) keys[provider] = key;
	}
	return keys;
}

export type State = {
	readonly config: OpenClawConfig | undefined;
	readonly settings: OpenClawSettings;
	readonly keys: Keys;
};

/** Everything the plugin reads for one decision, in one sequence. The tool and the router both read it here. */
export function readState(api: OpenClawApi, env: Environment): State {
	const config = readLive(api);
	const settings = readSettings(config, api.pluginConfig);
	return {
		config,
		settings,
		keys: readKeys(config, api.pluginConfig, settings.provider, env),
	};
}
