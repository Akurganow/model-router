import { type Slot, slotRecord, slotSetting } from "#core/decision/slots.ts";
import { isPlainObject } from "#core/options/models.ts";
import {
	type Settings as CheckedSettings,
	isSilent,
	type Stored,
	settingsOf,
} from "#core/options/settings.ts";
import {
	type Choice,
	collectKeysSync,
	KEY_FIELDS,
	KEY_VARIABLES,
	type Keys,
	type NoChoice,
} from "#core/providers/provider.ts";
import { isRecord } from "#utils/guards.ts";
import { nonEmpty } from "#utils/text.ts";
import type { OpenClawApi, OpenClawConfig } from "./types.ts";

export const PLUGIN_ID = "model-router-openclaw";

export type OpenClawSettings = {
	// The stored text of each value setting, unchecked: `settingsOf` checks it.
	readonly stored: Stored;
	// The model each slot takes: the `small_model`, `middle_model` and `large_model` settings.
	// Not the `models` setting, which names the scoring model of each provider and sits in `stored`.
	readonly slots: Readonly<Record<Slot, string | undefined>>;
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
 * Returns the first text a source holds in the field, or undefined when every
 * source is silent. One rule for the value settings, the models and the keys:
 * the first source that holds text decides, valid or not, and no later source
 * is read. A source whose text names no value must still decide, so that the
 * core can skip with the setup reason and a later source cannot hide the
 * mistake.
 */
function firstText(from: readonly Settings[], field: string): unknown {
	for (const settings of from) {
		const text = settings[field];
		if (!isSilent(text)) return text;
	}
	return undefined;
}

// A plain object holds the `models` setting as a value, as OpenClaw's config can carry a map; the
// text rule reads such a value as silence.
function firstModels(from: readonly Settings[]): unknown {
	for (const settings of from) {
		const { models } = settings;
		if (isPlainObject(models) || !isSilent(models)) return models;
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
		stored: {
			provider: firstText(from, "provider"),
			gateway: firstText(from, "gateway"),
			scope: firstText(from, "scope"),
			models: firstModels(from),
		},
		slots: slotRecord((slot) => nonEmpty(firstText(from, slotSetting(slot)))),
	};
}

/**
 * Returns the scoring keys of the key holders the choice asks, each from a source
 * field or else from its environment variable. A key holder with no key is
 * absent, and a NoChoice looks up nothing. OpenClaw's own OpenRouter provider reads the OpenRouter variable
 * too; no other credential of OpenClaw is a scoring key. Throws only when a source
 * getter throws.
 */
export function readKeys(
	live: OpenClawConfig | undefined,
	pluginConfig: Settings | undefined,
	choice: Choice | NoChoice,
	env: Environment,
): Keys {
	const from = sources(live, pluginConfig);
	return collectKeysSync(
		choice,
		(holder) =>
			nonEmpty(firstText(from, KEY_FIELDS[holder])) ??
			nonEmpty(env[KEY_VARIABLES[holder]]),
	);
}

export type State = {
	readonly config: OpenClawConfig | undefined;
	readonly settings: OpenClawSettings;
	// The stored settings, checked: the typed values, or the skip for one that is not valid.
	readonly chosen: CheckedSettings | NoChoice;
	readonly keys: Keys;
};

/** Everything the plugin reads for one decision, in one sequence. The tool and the router both read it here. */
export function readState(api: OpenClawApi, env: Environment): State {
	const config = readLive(api);
	const settings = readSettings(config, api.pluginConfig);
	const chosen = settingsOf(settings.stored);
	return {
		config,
		settings,
		chosen,
		keys: readKeys(config, api.pluginConfig, chosen, env),
	};
}
