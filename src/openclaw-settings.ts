import type { OpenClawConfig } from "./openclaw-types.ts";
import { isRecord, nonEmpty } from "./part.ts";
import {
	KEY_VARIABLES,
	order,
	type Provider,
	type ProviderValue,
	resolve,
} from "./provider.ts";
import { resolveScope, type Scope } from "./scope.ts";

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

const firstDefined = (from: readonly Settings[], field: string): unknown =>
	from.find((settings) => settings[field] !== undefined)?.[field];

export function readSettings(
	live: OpenClawConfig | undefined,
	pluginConfig: Settings | undefined,
): OpenClawSettings {
	const from = sources(live, pluginConfig);
	return {
		provider: resolve(firstDefined(from, "provider")),
		scope: resolveScope(firstDefined(from, "scope")),
		smallModel: nonEmpty(firstDefined(from, "small_model")),
		largeModel: nonEmpty(firstDefined(from, "large_model")),
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
