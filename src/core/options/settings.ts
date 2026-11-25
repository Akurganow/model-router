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
	type ModelNames,
	type NoChoice,
} from "#core/providers/provider.ts";
import { modelOf } from "#core/scoring/maker-registry.ts";
import { errorText } from "#utils/error.ts";
import { migrate } from "./migrate.ts";
import { readModels, textOf } from "./models.ts";
import { DEFAULT_SCOPE, SCOPE_VALUES, type Scope } from "./scope.ts";

export const VALUE_SETTINGS = ["provider", "gateway", "scope"] as const;
export type ValueSetting = (typeof VALUE_SETTINGS)[number];
// What a harness stored for each value setting, and for `models` and the removed `model`, as it read
// it. Any type: valueFor and readModels check each value, and the migration ladder reads `model`.
export type Stored = Readonly<
	Partial<Record<ValueSetting | "models" | "model", unknown>>
>;
export type Settings = Choice & {
	readonly scope: Scope;
	readonly models: ModelNames;
};
type KeyState = "set" | "unset";

export const TOOL_NAME = "model_router_config";
const COMMAND_PREFIX = "model-router-";
export const commandName = (setting: ValueSetting): string =>
	`${COMMAND_PREFIX}${setting}`;

const LABEL_SEPARATOR = " - ";

type ValueText<V extends string> = {
	readonly values: readonly V[];
	readonly about: string;
	readonly question: string;
	readonly consequences: Readonly<Record<V, string>>;
};

// The first value of each list is the default of its setting.
// Each entry is checked against its own values, so a value with no label fails the type check.
const TEXTS: Readonly<Record<ValueSetting, ValueText<string>>> = {
	provider: {
		values: MAKERS,
		about: "whose model scores subagent calls",
		question: "Which provider's model should score subagent calls?",
		consequences: {
			typesafe:
				"Jev from TypeSafe, the model the plugin's questions are fitted to",
			openai:
				"OpenAI's decision model; costs more than Jev and its answers are not fitted",
			google:
				"Google's decision model; costs more than Jev and its answers are not fitted; on a free-tier key Google may use the text",
		},
	} satisfies ValueText<Maker>,
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
	} satisfies ValueText<Gateway>,
	scope: {
		values: SCOPE_VALUES,
		about: "which agent calls the router routes",
		question: "Which agent calls should the router route?",
		consequences: {
			core: "built-in general agents only",
			extended: "also routes other agents that pass no model",
		},
	} satisfies ValueText<Scope>,
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
 * VALUE_SETTINGS order and then `models`, whose stored text is not valid. The
 * migration ladder runs first, so a stored removed option counts as its new form.
 */
export function settingsOf(stored: Stored): Settings | NoChoice {
	const provider = readProvider(stored.provider);
	if (provider === undefined) return { skipped: notValid("provider") };
	const gateway = readGateway(stored.gateway);
	if (gateway === undefined) return { skipped: notValid("gateway") };
	const scope = readScope(stored.scope);
	if (scope === undefined) return { skipped: notValid("scope") };
	const { models } = migrate(stored).stored;
	const read = readModels(models);
	if ("invalid" in read) return { skipped: notValid("models") };
	return { provider, gateway, scope, models: read.models };
}

/**
 * Returns the value the stored scope reads as: the default for a silent text,
 * and the default scope only when the stored scope itself is not valid. The
 * other settings play no part: a valid stored scope decides which calls get the
 * skip line of another setting that is not valid.
 */
export const scopeOf = (stored: Stored): Scope =>
	readScope(stored.scope) ?? DEFAULT_SCOPE;

export const useOneOf = (setting: ValueSetting): string =>
	`${setting}: use one of ${TEXTS[setting].values.join(", ")}`;

export const unchanged = (
	setting: ValueSetting | "models",
	reason: string,
): string => `${setting} unchanged: ${reason}`;

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

// The stored value of `models` as the report shows it.
const silent = (models: unknown): boolean =>
	models === undefined ||
	models === null ||
	(typeof models === "string" && models.trim() === "");

/**
 * Returns the lines of the `models` setting, read after the migration ladder. The first line shows
 * the value as stored, and says when the ladder changed it and the change is not stored yet, or
 * which entry is not valid. A valid value then gets one line per maker with the model name for each
 * path.
 */
export const modelsLines = (stored: Stored): string[] => {
	const { stored: migrated } = migrate(stored);
	const { models } = migrated;
	const shown = silent(models) ? "unset" : textOf(models);
	const pending =
		models === stored.models ? "" : " (not stored yet: run setup)";
	const read = readModels(models);
	if ("invalid" in read)
		return [`models: ${shown} (not valid: ${read.invalid})`];
	return [
		`models: ${shown}${pending}`,
		...MAKERS.map(
			(maker) =>
				`${maker} model: ${modelOf(maker, "direct", read.models[maker])} (OpenRouter: ${modelOf(maker, "openrouter", read.models[maker])})`,
		),
	];
};

/**
 * Returns the settings report: the line of each setting in order, the models lines, then the extra
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
		...modelsLines(stored),
		...extra,
		...keyLines,
	].join("\n");
};

const hasModel = (stored: Stored): boolean =>
	typeof stored.model === "string" && stored.model.trim() !== "";

/**
 * Returns what to write for the `models` text a person asked for, or the line that refuses it. The
 * text goes through the ladder, so a stored removed `model` becomes the `typesafe` entry when the
 * text names none. `eraseModel` is true when a stored `model` is left to erase.
 */
export function modelsWrite(
	stored: Stored,
	text: string,
):
	| { readonly models: string; readonly eraseModel: boolean }
	| { readonly refused: string } {
	const read = readModels(text);
	if ("invalid" in read)
		return { refused: unchanged("models", `not valid: ${read.invalid}`) };
	const { models } = migrate({ ...stored, models: text }).stored;
	return {
		models: typeof models === "string" ? models : text,
		eraseModel: hasModel(stored),
	};
}

/**
 * Returns the `models` text the ladder makes from a stored `model`, for the write that comes before
 * a change of provider erases `model`. Returns undefined when the ladder changes nothing.
 */
export function pendingModels(stored: Stored): string | undefined {
	const { stored: migrated, changes } = migrate(stored);
	if (changes.length === 0 || !hasModel(stored)) return undefined;
	const { models } = migrated;
	return textOf(models);
}

export const toolDescription = (): string =>
	`Reads the router's settings. With no input it returns the provider, gateway, scope and models, and whether each key the settings allow is set. With a setting name (${VALUE_SETTINGS.join(", ")}) the plugin asks the person in its own dialog and writes their choice; never pass a value for these. With models and a string, the tool writes that string as the models setting at the person's request, for example {typesafe:jev-latest, openai:gpt-6-luna}. Never pass a key.`;

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
