import type { OpenClawApi, OpenClawConfig } from "./openclaw-types.ts";
import { isRecord, nonEmpty } from "./part.ts";
import {
	KEY_VARIABLES,
	order,
	PROVIDER_VALUES,
	type Provider,
	type ProviderValue,
	resolve,
} from "./provider.ts";
import { resolveScope, SCOPE_VALUES, type Scope } from "./scope.ts";

export const PLUGIN_ID = "model-router-openclaw";

export type OpenClawSettings = {
	readonly provider: ProviderValue;
	readonly scope: Scope;
	readonly smallModel: string | undefined;
	readonly largeModel: string | undefined;
};
export type Keys = Readonly<Partial<Record<Provider, string>>>;
export type Environment = Readonly<Record<string, string | undefined>>;
type Settings = Record<string, unknown>;

const KEY_FIELDS: Readonly<Record<Provider, string>> = {
	typesafe: "api_key",
	openrouter: "openrouter_api_key",
};

// The live config holds a command's write. The plugin config is what OpenClaw read at start-up.
function sources(
	live: OpenClawConfig | undefined,
	pluginConfig: Settings | undefined,
): readonly Settings[] {
	const entry = live?.plugins?.entries?.[PLUGIN_ID]?.config;
	return [entry, pluginConfig].filter(isRecord);
}

// A source whose value is invalid counts as silent, so a later source can still supply the setting.
const firstValid = (
	from: readonly Settings[],
	field: string,
	valid: (value: unknown) => boolean,
): unknown => from.map((settings) => settings[field]).find(valid);

const oneOf =
	(allowed: readonly unknown[]) =>
	(value: unknown): boolean =>
		allowed.includes(value);
const isProvider = oneOf(PROVIDER_VALUES);
const isScope = oneOf(SCOPE_VALUES);
const isText = (value: unknown): boolean => nonEmpty(value) !== undefined;

/** The live config, or undefined when the runtime cannot read it. The tool and the router both read it here. */
export function readLive(api: OpenClawApi): OpenClawConfig | undefined {
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
		provider: resolve(firstValid(from, "provider", isProvider)),
		scope: resolveScope(firstValid(from, "scope", isScope)),
		smallModel: nonEmpty(firstValid(from, "small_model", isText)),
		largeModel: nonEmpty(firstValid(from, "large_model", isText)),
	};
}

// Only the providers the value allows are read. OpenClaw's own provider credentials are never Jev keys.
export function readKeys(
	live: OpenClawConfig | undefined,
	pluginConfig: Settings | undefined,
	providerValue: unknown,
	env: Environment,
): Keys {
	const from = sources(live, pluginConfig);
	const keys: Partial<Record<Provider, string>> = {};
	for (const provider of order(providerValue)) {
		const key =
			from.map((s) => nonEmpty(s[KEY_FIELDS[provider]])).find(Boolean) ??
			nonEmpty(env[KEY_VARIABLES[provider]]);
		if (key !== undefined) keys[provider] = key;
	}
	return keys;
}
