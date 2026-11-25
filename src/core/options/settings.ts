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
import { textOf } from "#utils/text.ts";
import { migrate, type StoredRecord } from "./migrate.ts";
import { isSilentModels, readModels } from "./models.ts";
import { DEFAULT_SCOPE, SCOPE_VALUES, type Scope } from "./scope.ts";

export const VALUE_SETTINGS = ["provider", "gateway", "scope"] as const;
export type ValueSetting = (typeof VALUE_SETTINGS)[number];
// What a harness stored for each value setting and for `models`, as it read it. Any type: valueFor
// and readModels check each value.
export type Stored = Readonly<
	Partial<Record<ValueSetting | "models", unknown>>
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
			typesafe: "Jev from TypeSafe",
			openai: "OpenAI's decision model",
			google: "Google's decision model",
			perplexity: "Perplexity's decision model",
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
			core: "the default agents only",
			extended: "also other agents, as the README lists",
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

export const MORE = "more";

// Claude Code's dialog takes at most four options. The other harnesses page the same way, so a
// choice reads alike in all four.
const PAGE_MAX = 4;
const PAGE_VALUES = PAGE_MAX - 1;

/** Returns the values with the current one first, or in their order when there is no current. */
export const currentFirst = <V>(
	values: readonly V[],
	current: V | undefined,
): V[] =>
	current === undefined
		? [...values]
		: [current, ...values.filter((value) => value !== current)];

/**
 * Returns the pages of a choice. Up to four options make one page with no `more`. More make pages
 * of three options and `more`, and the last page holds the rest and `more`.
 */
export function pagesOf(options: readonly string[]): string[][] {
	if (options.length <= PAGE_MAX) return [[...options]];
	const pages: string[][] = [];
	for (let at = 0; at < options.length; at += PAGE_VALUES)
		pages.push([...options.slice(at, at + PAGE_VALUES), MORE]);
	return pages;
}

/**
 * Shows the pages of a choice one at a time from the first. `more` moves to the next page, and from
 * the last page back to the first. Any other answer, or none, is returned as it is.
 */
export async function askPaged(
	question: string,
	options: readonly string[],
	select: (question: string, page: string[]) => Promise<string | undefined>,
): Promise<string | undefined> {
	const pages = pagesOf(options);
	for (;;)
		for (const page of pages) {
			const answer = await select(question, page);
			if (answer !== MORE || pages.length === 1) return answer;
		}
}

// The current value comes first when it is valid. Otherwise the values keep their order.
export function ask(
	setting: ValueSetting,
	current: unknown,
): { question: string; options: string[] } {
	const { values, question } = TEXTS[setting];
	return {
		question,
		options: currentFirst(values, valueFor(setting, current)).map((value) =>
			label(setting, value),
		),
	};
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
		answer = await askPaged(question, options, select);
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

const modelsLinesFrom = (record: StoredRecord): string[] => {
	const { models } = record;
	const shown = isSilentModels(models) ? "unset" : textOf(models);
	const read = readModels(models);
	if ("invalid" in read)
		return [`models: ${shown} (not valid: ${read.invalid})`];
	return [
		`models: ${shown}`,
		...MAKERS.map(
			(maker) =>
				`${maker} model: ${modelOf(maker, "direct", read.models[maker])} (OpenRouter: ${modelOf(maker, "openrouter", read.models[maker])})`,
		),
	];
};

/**
 * Returns the lines of the `models` setting, read after the migration ladder. The first line shows
 * the value as stored, or which entry is not valid. A valid value then gets one line per maker with
 * the model name for each path.
 */
export const modelsLines = (stored: Stored): string[] =>
	modelsLinesFrom(migrate(stored).stored);

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
	const { stored: record } = migrate(stored);
	const settings = settingsFrom(record);
	const keyLines: string[] =
		"skipped" in settings
			? []
			: holders(settings).map((holder) =>
					keyLine(holder, keys[holder] === undefined ? "unset" : "set"),
				);
	return [
		...VALUE_SETTINGS.map((setting) => valueLineFrom(setting, record)),
		...modelsLinesFrom(record),
		...extra,
		...keyLines,
	].join("\n");
};

/** Returns the `models` text to store for the text a person asked for, or the line that refuses it. */
export function modelsWrite(
	text: string,
): { readonly models: string } | { readonly refused: string } {
	const read = readModels(text);
	if ("invalid" in read)
		return { refused: unchanged("models", `not valid: ${read.invalid}`) };
	return { models: text };
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
