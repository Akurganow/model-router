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
import { nonEmpty, textOf } from "#utils/text.ts";
import { migrate, type StoredRecord } from "./migrate.ts";
import { isSilentModels, readModels } from "./models.ts";
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

// The settings of a record the ladder already ran on.
function settingsFrom(record: StoredRecord): Settings | NoChoice {
	const { provider, gateway, scope, models } = record;
	const maker = readProvider(provider);
	if (maker === undefined) return { skipped: notValid("provider") };
	const via = readGateway(gateway);
	if (via === undefined) return { skipped: notValid("gateway") };
	const routed = readScope(scope);
	if (routed === undefined) return { skipped: notValid("scope") };
	const read = readModels(models);
	if ("invalid" in read) return { skipped: notValid("models") };
	return { provider: maker, gateway: via, scope: routed, models: read.models };
}

/**
 * Returns the typed settings, or the skip reason of the first setting, in
 * VALUE_SETTINGS order and then `models`, whose stored text is not valid. The
 * migration ladder runs first on the whole record, so a stored removed option
 * counts as its new form.
 */
export const settingsOf = (stored: Stored): Settings | NoChoice =>
	settingsFrom(migrate(stored).stored);

/**
 * Returns the value the stored scope reads as: the default for a silent text,
 * and the default scope only when the stored scope itself is not valid. The
 * other settings play no part: a valid stored scope decides which calls get the
 * skip line of another setting that is not valid.
 */
export function scopeOf(stored: Stored): Scope {
	const { scope } = migrate(stored).stored;
	return readScope(scope) ?? DEFAULT_SCOPE;
}

export const useOneOf = (setting: ValueSetting): string =>
	`${setting}: use one of ${TEXTS[setting].values.join(", ")}`;

export const unchanged = (
	setting: ValueSetting | "models" | "model",
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

const valueLineFrom = (setting: ValueSetting, record: StoredRecord): string => {
	const shown = record[setting];
	const value = valueFor(setting, shown);
	if (value === undefined)
		return `${setting}: ${String(shown)} (not valid: use one of ${TEXTS[setting].values.join(", ")})`;
	const settings = settingsFrom(record);
	if (setting === "gateway" && !("skipped" in settings))
		return `gateway: ${value} (${holders(settings).join(", then ")})`;
	return `${setting}: ${value}`;
};

/**
 * Returns the line of one setting. A setting that is not valid shows its stored
 * text and the values it takes. A gateway that is valid also names the key
 * holders it asks, but only when every setting is valid.
 */
export const valueLine = (setting: ValueSetting, stored: Stored): string =>
	valueLineFrom(setting, migrate(stored).stored);

const NOT_STORED = " (not stored yet: run setup)";

const modelsLinesFrom = (record: StoredRecord, pending: boolean): string[] => {
	const { models } = record;
	const shown = isSilentModels(models) ? "unset" : textOf(models);
	const read = readModels(models);
	if ("invalid" in read)
		return [`models: ${shown} (not valid: ${read.invalid})`];
	return [
		`models: ${shown}${pending ? NOT_STORED : ""}`,
		...MAKERS.map(
			(maker) =>
				`${maker} model: ${modelOf(maker, "direct", read.models[maker])} (OpenRouter: ${modelOf(maker, "openrouter", read.models[maker])})`,
		),
	];
};

type Migrated = ReturnType<typeof migrate>;

const hasModel = (stored: Stored): boolean =>
	nonEmpty(stored.model) !== undefined;

// What the stored removed `model` leaves to do: the models text the ladder made, when it changed
// anything, and the erase of `model` itself.
const carryFrom = (
	stored: Stored,
	{ stored: { models }, changes }: Migrated,
): { readonly models?: string; readonly eraseModel: boolean } => ({
	...(changes.length > 0 ? { models: textOf(models) } : {}),
	eraseModel: hasModel(stored),
});

const isPending = (carry: ReturnType<typeof carryFrom>): boolean =>
	carry.models !== undefined || carry.eraseModel;

/**
 * Returns the lines of the `models` setting, read after the migration ladder. The first line shows
 * the value as stored, and says when the ladder changed it or a removed `model` is left to erase
 * and the change is not stored yet, or which entry is not valid. A valid value then gets one line
 * per maker with the model name for each path.
 */
export const modelsLines = (stored: Stored): string[] => {
	const migrated = migrate(stored);
	return modelsLinesFrom(
		migrated.stored,
		isPending(carryFrom(stored, migrated)),
	);
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
	const migrated = migrate(stored);
	const { stored: record } = migrated;
	const settings = settingsFrom(record);
	const keyLines: string[] =
		"skipped" in settings
			? []
			: holders(settings).map((holder) =>
					keyLine(holder, keys[holder] === undefined ? "unset" : "set"),
				);
	return [
		...VALUE_SETTINGS.map((setting) => valueLineFrom(setting, record)),
		...modelsLinesFrom(record, isPending(carryFrom(stored, migrated))),
		...extra,
		...keyLines,
	].join("\n");
};

/**
 * Returns what a stored removed `model` leaves to write. `models` is the text the ladder made of
 * the record, present only when the ladder changed it. `eraseModel` is true whenever a `model`
 * that is not blank is stored, even when the ladder copied nothing.
 */
export const modelCarry = (
	stored: Stored,
): { readonly models?: string; readonly eraseModel: boolean } =>
	carryFrom(stored, migrate(stored));

/**
 * Returns the `models` text to store for the text a person asked for, or the line that refuses it.
 * The text goes through the ladder, so a stored removed `model` becomes the `typesafe` entry when
 * the text names none.
 */
export function modelsWrite(
	stored: Stored,
	text: string,
): { readonly models: string } | { readonly refused: string } {
	const read = readModels(text);
	if ("invalid" in read)
		return { refused: unchanged("models", `not valid: ${read.invalid}`) };
	return { models: modelCarry({ ...stored, models: text }).models ?? text };
}

/**
 * Returns the text a `models` call of a config tool carries, or the line that refuses its shape:
 * `models` beside a `setting`, or `models` that is not text.
 */
export const modelsCallOf = (
	setting: unknown,
	models: unknown,
): { readonly text: string } | { readonly refused: string } =>
	typeof models === "string" && setting === undefined
		? { text: models }
		: { refused: BAD_MODELS_CALL };

/** Returns the unchanged line when the stored `models` equals the text to write, else undefined. */
export const modelsAlready = (
	held: unknown,
	text: string,
): string | undefined =>
	held === text ? unchanged("models", alreadyValue(text)) : undefined;

export const toolDescription = (): string =>
	`Reads the router's settings. With no input it returns the provider, gateway, scope and models, and whether each key the settings allow is set. With a setting name (${VALUE_SETTINGS.join(", ")}) the plugin asks the person in its own dialog and writes their choice; never pass a value for these. With models and a string, the tool writes that string as the models setting at the person's request, for example {typesafe:jev-latest, openai:gpt-6-luna}. Never pass a key.`;

/** Returns the description of the read-only settings tool. `returned` lists what a call returns. */
export const readOnlyToolDescription = (returned: readonly string[]): string =>
	`Reads the router's settings. It returns ${returned.join(", ")}, and whether each key the settings allow is set. It changes nothing and never returns a key.`;

export const TOOL_LABEL = "Model Router settings";

// A call that passes `models` beside `setting`, or `models` that is not text.
export const BAD_MODELS_CALL = "Pass setting alone, or models as a text alone.";

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
