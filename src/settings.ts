import {
	order,
	PROVIDER_VALUES,
	type Provider,
	resolve as resolveProvider,
} from "./provider.ts";
import { resolveScope, SCOPE_VALUES } from "./scope.ts";

export const VALUE_SETTINGS = ["provider", "scope"] as const;
export const KEY_SETTINGS = ["typesafe_key", "openrouter_key"] as const;
export const SETTING_NAMES = [...VALUE_SETTINGS, ...KEY_SETTINGS] as const;
export type ValueSetting = (typeof VALUE_SETTINGS)[number];
export type KeySetting = (typeof KEY_SETTINGS)[number];
export type SettingName = (typeof SETTING_NAMES)[number];
export type KeyState = "set" | "unset" | "saved, checking";

const KEY_PROVIDERS: Readonly<Record<KeySetting, Provider>> = {
	typesafe_key: "typesafe",
	openrouter_key: "openrouter",
};
const PROVIDER_NAMES: Readonly<Record<Provider, string>> = {
	typesafe: "TypeSafe",
	openrouter: "OpenRouter",
};

export const KEY_MAX_LENGTH = 512;
// A dialog that asks for text pads its options with these labels.
const PADDED_LABELS: readonly string[] = ["Yes", "No"];
const LINE_BREAK = /[\r\n\u2028\u2029]/;
const LABEL_SEPARATOR = " - ";

type ValueText = {
	readonly values: readonly string[];
	readonly resolve: (value: unknown) => string;
	readonly about: string;
	readonly question: string;
	readonly consequences: Readonly<Record<string, string>>;
};

const TEXTS: Readonly<Record<ValueSetting, ValueText>> = {
	provider: {
		values: PROVIDER_VALUES,
		resolve: resolveProvider,
		about: "which providers score subagent calls",
		question: "Which providers should score subagent calls?",
		consequences: {
			auto: "TypeSafe, then OpenRouter if TypeSafe fails",
			"openrouter-first": "OpenRouter, then TypeSafe if OpenRouter fails",
			typesafe: "TypeSafe only",
			openrouter: "OpenRouter only",
		},
	},
	scope: {
		values: SCOPE_VALUES,
		resolve: resolveScope,
		about: "which agent calls the router routes",
		question: "Which agent calls should the router route?",
		consequences: {
			core: "today's routing: built-in general agents only",
			extended: "also routes other agents that pass no model",
		},
	},
};

export const isValueSetting = (name: unknown): name is ValueSetting =>
	VALUE_SETTINGS.some((known) => known === name);

export const isKeySetting = (name: unknown): name is KeySetting =>
	KEY_SETTINGS.some((known) => known === name);

export const isSettingName = (name: unknown): name is SettingName =>
	isValueSetting(name) || isKeySetting(name);

export const keyProvider = (setting: KeySetting): Provider =>
	KEY_PROVIDERS[setting];

export const isValue = (setting: ValueSetting, value: unknown): boolean =>
	TEXTS[setting].values.some((known) => known === value);

// The provider line prints the stored value as it is, as the command always has.
export const valueLine = (setting: ValueSetting, value: unknown): string =>
	setting === "provider"
		? `provider: ${value} (${order(value).join(", then ")})`
		: `scope: ${resolveScope(value)}`;

export const useOneOf = (setting: ValueSetting): string =>
	`${setting}: use one of ${TEXTS[setting].values.join(", ")}`;

export const unchanged = (setting: ValueSetting, reason: string): string =>
	`${setting} unchanged: ${reason}`;

export const alreadyValue = (value: string): string => `already ${value}`;

export const projectOverrides = (setting: ValueSetting): string =>
	`A project value for ${setting} overrides it.`;

export const NO_ANSWER = "no answer from the dialog";
export const NOT_OFFERED = "the answer was not one of the offered values";
export const REFUSED =
	"Permission rules deny this tool, so nothing was read or changed.";

export const keyLine = (provider: Provider, state: KeyState): string =>
	`${provider} key: ${state}`;

export const keyNotSaved = (provider: Provider): string =>
	`${provider} key not saved`;

const label = (setting: ValueSetting, value: string): string =>
	`${value}${LABEL_SEPARATOR}${TEXTS[setting].consequences[value]}`;

export function ask(
	setting: ValueSetting,
	current: unknown,
): { question: string; options: string[] } {
	const { values, resolve, question } = TEXTS[setting];
	const first = resolve(current);
	const sorted = [first, ...values.filter((value) => value !== first)];
	return { question, options: sorted.map((value) => label(setting, value)) };
}

export function pick(
	setting: ValueSetting,
	answer: unknown,
): string | undefined {
	return TEXTS[setting].values.find(
		(value) => label(setting, value) === answer,
	);
}

export function keyFrom(answer: unknown): string | undefined {
	if (typeof answer !== "string" || LINE_BREAK.test(answer)) return undefined;
	const key = answer.trim();
	return key === "" ||
		key.length > KEY_MAX_LENGTH ||
		PADDED_LABELS.includes(key)
		? undefined
		: key;
}

export const keyQuestion = (provider: Provider, replaces: boolean): string =>
	`Enter your ${PROVIDER_NAMES[provider]} API key. It goes to the harness's secure storage.${
		replaces ? " It replaces the key that is set now." : ""
	}`;

export const toolDescription = (names: readonly string[]): string =>
	`Reads the router's settings. With no input it returns the provider and scope, and whether each key the provider allows is set. With a setting name (${names.join(", ")}) the plugin asks the person in its own dialog and writes their choice. Never pass a value or a key: the person supplies them in the dialog.`;

export const TOOL_LABEL = "Model Router settings";

export const badCall = (names: readonly string[]): string =>
	`Unknown setting. Pass no setting, or one of: ${names.join(", ")}`;

function describeCommand(setting: ValueSetting): string {
	const { about, values } = TEXTS[setting];
	return `Shows or changes ${about}: ${values.join(", ")}.`;
}

export const COMMAND_DESCRIPTIONS: Readonly<Record<ValueSetting, string>> = {
	provider: describeCommand("provider"),
	scope: describeCommand("scope"),
};
