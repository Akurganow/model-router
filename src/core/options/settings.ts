import { notValid } from "#core/output/reasons.ts";
import {
	type Choice,
	GATEWAYS,
	type Gateway,
	holders,
	type KeyHolder,
	type Keys,
	MAKERS,
	type Maker,
	type NoChoice,
} from "#core/providers/provider.ts";
import { errorText } from "#utils/error.ts";
import { DEFAULT_SCOPE, SCOPE_VALUES, type Scope } from "./scope.ts";

export const VALUE_SETTINGS = ["provider", "gateway", "scope"] as const;
export type ValueSetting = (typeof VALUE_SETTINGS)[number];
// What a harness stored for each value setting, as it read it. Any type: valueFor checks each text.
export type Stored = Readonly<Partial<Record<ValueSetting, unknown>>>;
export type Settings = Choice & { readonly scope: Scope };
type KeyState = "set" | "unset";

export const TOOL_NAME = "model_router_config";
const COMMAND_PREFIX = "model-router-";
export const commandName = (setting: ValueSetting): string =>
	`${COMMAND_PREFIX}${setting}`;

const LABEL_SEPARATOR = " - ";

type ValueText = {
	readonly values: readonly string[];
	readonly about: string;
	readonly question: string;
	readonly consequences: Readonly<Record<string, string>>;
};

// The first value of each list is the default of its setting.
const TEXTS: Readonly<Record<ValueSetting, ValueText>> = {
	provider: {
		values: MAKERS,
		about: "whose model scores subagent calls",
		question: "Which provider's model should score subagent calls?",
		consequences: {
			typesafe:
				"Jev from TypeSafe, the model the plugin's questions are fitted to",
		},
	},
	gateway: {
		values: GATEWAYS,
		about: "how OpenRouter is used for the provider",
		question: "How should OpenRouter be used for the provider?",
		consequences: {
			direct: "the provider's own API only",
			auto: "the provider's own API, then OpenRouter if it fails",
			"openrouter-first": "OpenRouter, then the provider's own API if it fails",
			openrouter: "OpenRouter only",
		},
	},
	scope: {
		values: SCOPE_VALUES,
		about: "which agent calls the router routes",
		question: "Which agent calls should the router route?",
		consequences: {
			core: "built-in general agents only",
			extended: "also routes other agents that pass no model",
		},
	},
};

export const isValueSetting = (name: unknown): name is ValueSetting =>
	VALUE_SETTINGS.some((known) => known === name);

export const isValue = (setting: ValueSetting, value: unknown): boolean =>
	TEXTS[setting].values.some((known) => known === value);

// Silent text is not a choice: it reads as the default, as a setting never written does.
export const isSilent = (stored: unknown): boolean =>
	typeof stored !== "string" || stored.trim() === "";

/**
 * Returns the value a stored text reads as: the default when the text is silent,
 * the value it equals when there is one, and undefined when it is not valid.
 * Never throws.
 */
export const valueFor = (
	setting: ValueSetting,
	stored: unknown,
): string | undefined =>
	isSilent(stored)
		? TEXTS[setting].values[0]
		: TEXTS[setting].values.find((value) => value === stored);

// One typed reader per setting, so no cast is needed to narrow a stored text.
const readProvider = (stored: unknown): Maker | undefined =>
	MAKERS.find((maker) => maker === valueFor("provider", stored));
const readGateway = (stored: unknown): Gateway | undefined =>
	GATEWAYS.find((gateway) => gateway === valueFor("gateway", stored));
const readScope = (stored: unknown): Scope | undefined =>
	SCOPE_VALUES.find((scope) => scope === valueFor("scope", stored));

/**
 * Returns the typed settings, or the skip reason of the first setting, in
 * VALUE_SETTINGS order, whose stored text is not valid.
 */
export function settingsOf(stored: Stored): Settings | NoChoice {
	const provider = readProvider(stored.provider);
	if (provider === undefined) return { skipped: notValid("provider") };
	const gateway = readGateway(stored.gateway);
	if (gateway === undefined) return { skipped: notValid("gateway") };
	const scope = readScope(stored.scope);
	if (scope === undefined) return { skipped: notValid("scope") };
	return { provider, gateway, scope };
}

/**
 * Returns the scope, or the default scope when the settings are not valid.
 * Settings that are not valid route nothing, so the default scope decides which
 * calls get the skip reason.
 */
export const scopeOf = (settings: Settings | NoChoice): Scope =>
	"skipped" in settings ? DEFAULT_SCOPE : settings.scope;

export const useOneOf = (setting: ValueSetting): string =>
	`${setting}: use one of ${TEXTS[setting].values.join(", ")}`;

export const unchanged = (setting: ValueSetting, reason: string): string =>
	`${setting} unchanged: ${reason}`;

/** Returns the unchanged line for a thrown value, whatever its type. */
export const unchangedBy = (setting: ValueSetting, err: unknown): string =>
	unchanged(setting, errorText(err));

export const alreadyValue = (value: string): string => `already ${value}`;

export const NO_ANSWER = "no answer from the dialog";
export const NOT_OFFERED = "the answer was not one of the offered values";

export const keyLine = (holder: KeyHolder, state: KeyState): string =>
	`${holder} key: ${state}`;

const label = (setting: ValueSetting, value: string): string =>
	`${value}${LABEL_SEPARATOR}${TEXTS[setting].consequences[value]}`;

// The current value comes first when it is valid. Otherwise the values keep their order.
export function ask(
	setting: ValueSetting,
	current: unknown,
): { question: string; options: string[] } {
	const { values, question } = TEXTS[setting];
	const first = valueFor(setting, current);
	const sorted =
		first === undefined
			? values
			: [first, ...values.filter((value) => value !== first)];
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
 * Returns the line of one setting. A setting that is not valid shows its stored
 * text and the values it takes. A gateway that is valid also names the key
 * holders it asks, but only when every setting is valid.
 */
export const valueLine = (setting: ValueSetting, stored: Stored): string => {
	const value = valueFor(setting, stored[setting]);
	if (value === undefined)
		return `${setting}: ${String(stored[setting])} (not valid: use one of ${TEXTS[setting].values.join(", ")})`;
	const settings = settingsOf(stored);
	if (setting === "gateway" && !("skipped" in settings))
		return `gateway: ${value} (${holders(settings).join(", then ")})`;
	return `${setting}: ${value}`;
};

/**
 * Returns the settings report: the line of each setting in order, then the extra
 * lines, then one line for each key holder the settings ask, in order, that says
 * whether its entry in keys is set or unset. Key lines appear only when every
 * setting is valid. A key is only checked for presence. Nothing about it leaves
 * this function.
 */
export const settingsReport = (
	stored: Stored,
	extra: readonly string[],
	keys: Keys,
): string => {
	const settings = settingsOf(stored);
	const keyLines: string[] =
		"skipped" in settings
			? []
			: holders(settings).map((holder) =>
					keyLine(holder, keys[holder] === undefined ? "unset" : "set"),
				);
	return [
		...VALUE_SETTINGS.map((setting) => valueLine(setting, stored)),
		...extra,
		...keyLines,
	].join("\n");
};

export const toolDescription = (): string =>
	`Reads the router's settings. With no input it returns the provider, gateway and scope, and whether each key the settings allow is set. With a setting name (${VALUE_SETTINGS.join(", ")}) the plugin asks the person in its own dialog and writes their choice. Never pass a value or a key. The person picks the value in the dialog.`;

/** Returns the description of the read-only settings tool. `returned` lists what a call returns. */
export const readOnlyToolDescription = (returned: readonly string[]): string =>
	`Reads the router's settings. It returns ${returned.join(", ")}, and whether each key the settings allow is set. It changes nothing and never returns a key.`;

export const TOOL_LABEL = "Model Router settings";

export const badCall = (): string =>
	`Unknown setting. Pass no setting, or one of: ${VALUE_SETTINGS.join(", ")}`;

function describeCommand(setting: ValueSetting): string {
	const { about, values } = TEXTS[setting];
	return `Shows or changes ${about}: ${values.join(", ")}.`;
}

export const COMMAND_DESCRIPTIONS: Readonly<Record<ValueSetting, string>> = {
	provider: describeCommand("provider"),
	gateway: describeCommand("gateway"),
	scope: describeCommand("scope"),
};
