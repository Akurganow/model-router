import { errorText } from "../utils/error.ts";
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
type KeyState = "set" | "unset" | "saved, checking";

export const TOOL_NAME = "model_router_config";
const COMMAND_PREFIX = "model-router-";
export const commandName = (setting: ValueSetting): string =>
	`${COMMAND_PREFIX}${setting}`;

const KEY_PROVIDERS: Readonly<Record<KeySetting, Provider>> = {
	typesafe_key: "typesafe",
	openrouter_key: "openrouter",
};
export const PROVIDER_NAMES: Readonly<Record<Provider, string>> = {
	typesafe: "TypeSafe",
	openrouter: "OpenRouter",
};

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

/** Returns the chat command line and the allowed values of a value setting, one per line. */
export const valueSettingHelp = (setting: ValueSetting): string =>
	[
		`Type /${commandName(setting)} <value> in the chat.`,
		useOneOf(setting),
	].join("\n");

export const unchanged = (setting: ValueSetting, reason: string): string =>
	`${setting} unchanged: ${reason}`;

/** Returns the unchanged line for a thrown value, whatever its type. */
export const unchangedBy = (setting: ValueSetting, err: unknown): string =>
	unchanged(setting, errorText(err));

export const alreadyValue = (value: string): string => `already ${value}`;

export const NO_ANSWER = "no answer from the dialog";
export const NOT_OFFERED = "the answer was not one of the offered values";

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

/**
 * Asks the person which value a setting takes and returns the line to show.
 * `select` shows the question and returns the answer. A dialog that returns
 * undefined, throws or rejects gave no answer. An answer that is not an offered
 * label is refused. `apply` gets the picked value and returns the line, so each
 * harness keeps its own test for a value that already holds.
 */
export async function chooseValue(
	setting: ValueSetting,
	current: unknown,
	select: (question: string, options: string[]) => Promise<string | undefined>,
	apply: (value: string) => Promise<string>,
): Promise<string> {
	const { question, options } = ask(setting, current);
	let answer: string | undefined;
	try {
		answer = await select(question, options);
	} catch {
		answer = undefined;
	}
	if (answer === undefined) return unchanged(setting, NO_ANSWER);
	const value = pick(setting, answer);
	return value === undefined ? unchanged(setting, NOT_OFFERED) : apply(value);
}

/**
 * Returns the settings report: the provider and scope lines, then the extra
 * lines, then one line for each key state in the order given.
 */
export const settingsReport = (
	provider: unknown,
	scope: unknown,
	extra: readonly string[],
	keys: readonly (readonly [Provider, KeyState])[],
): string =>
	[
		valueLine("provider", provider),
		valueLine("scope", scope),
		...extra,
		...keys.map(([name, state]) => keyLine(name, state)),
	].join("\n");

export const toolDescription = (names: readonly string[]): string =>
	`Reads the router's settings. With no input it returns the provider and scope, and whether each key the provider allows is set. With a setting name (${names.join(", ")}) the plugin asks the person in its own dialog and writes their choice. Never pass a value or a key: the person supplies them in the dialog.`;

/**
 * Returns the description of the read-only settings tool. `returned` lists what
 * a call with no input returns, and `names` the settings it answers for.
 */
export const readOnlyToolDescription = (
	returned: readonly string[],
	names: readonly string[],
): string =>
	`Reads the router's settings. With no input it returns ${returned.join(", ")}, and whether each key the provider allows is set. With a setting name (${names.join(", ")}) it returns how the person changes that setting. It changes nothing and never returns a key.`;

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
