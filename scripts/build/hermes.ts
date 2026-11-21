import { settingTexts, setupTexts } from "#adapters/hermes/setup.ts";
import { HERMES_TEXTS, taskParameterTexts } from "#adapters/hermes/texts.ts";
import { EFFORTS } from "#core/decision/ladder.ts";
import {
	pickModel,
	SLOT_SETTINGS,
	type Slot,
	slotForLevel,
	slotRecord,
	slotSetting,
} from "#core/decision/slots.ts";
import {
	isSilent,
	type Stored,
	settingsOf,
	valueFor,
	valueLine,
} from "#core/options/settings.ts";
import { LINE_PREFIX, pinnedLine, skippedLine } from "#core/output/line.ts";
import { notValid } from "#core/output/reasons.ts";
import { LEVELS, type Level } from "#core/parts/part.ts";
import {
	holders,
	KEY_HOLDERS,
	KEY_VARIABLES,
} from "#core/providers/provider.ts";
import { ROUTING_LIMIT_MS } from "#core/scoring/limit.ts";
import { type JsonObject, type Rendered, serialize } from "./json.ts";
import { HERMES_OUTPUTS } from "./outputs.ts";
import { hermesKeySetting, type Source } from "./source.ts";
import {
	SETTING_VALUES,
	TOOL_NAME,
	VALUE_SETTINGS,
	type ValueSetting,
} from "./values.ts";

type HermesSetting = Exclude<ValueSetting, "scope">;

// Hermes keeps no scope setting, so its list is the core's list without scope.
const HERMES_SETTINGS = VALUE_SETTINGS.filter(
	(setting): setting is HermesSetting => setting !== "scope",
);

// Hermes reads plugin.yaml with yaml.safe_load, which refuses a tab, and the version check reads it as JSON, so it is JSON text with space indentation.
const yamlText = (value: JsonObject): string =>
	`${JSON.stringify(value, null, 2)}\n`;

const describe = (hint: { label: string; help: string }) => ({
	label: hint.label,
	description: hint.help,
});

const keySettings = (source: Source): JsonObject =>
	Object.fromEntries(
		KEY_HOLDERS.map((holder) => [
			hermesKeySetting(holder),
			{
				type: "secret",
				env: KEY_VARIABLES[holder],
				...describe(source.hermes.settings[hermesKeySetting(holder)]),
			},
		]),
	);

// config_schema follows the Hermes plugin manifest: a type per setting, choices on a str, and an env name on a secret.
const configSchema = (source: Source): JsonObject => ({
	...Object.fromEntries(
		HERMES_SETTINGS.map((setting) => [
			setting,
			{
				type: "str",
				choices: [...SETTING_VALUES[setting]],
				default: source.options[setting].default,
				label: source.options[setting].title,
				description: source.options[setting].descriptions.hermes,
			},
		]),
	),
	...Object.fromEntries(
		SLOT_SETTINGS.map((setting) => [
			setting,
			{ type: "dict", ...describe(source.hermes.settings[setting]) },
		]),
	),
	...keySettings(source),
});

const manifest = (source: Source): JsonObject => ({
	name: source.hermes.pluginName,
	version: source.version,
	description: source.descriptions.hermes.manifest,
	author: source.author.name,
	kind: "backend",
	requires_hermes: source.hermes.requiresHermes,
	provides_tools: [TOOL_NAME],
	config_schema: configSchema(source),
});

const skipLine = (reason: string): string =>
	`${LINE_PREFIX}${skippedLine(reason)}`;

const levelOf = (slot: Slot): Level =>
	LEVELS.find((level) => slotForLevel(level) === slot) ?? 0;

// The label of a pinned level whose slot has no model, worded by pickModel. It carries no probabilities, since Jev was not asked.
const pinnedLabel = (slot: Slot): string =>
	LINE_PREFIX +
	pinnedLine(
		levelOf(slot),
		pickModel(levelOf(slot), { state: "unset" }).target,
	);

// One entry per setting Hermes stores, in order: its values, its default and every text Python prints for it.
const settingEntry = (setting: HermesSetting): JsonObject => ({
	name: setting,
	values: [...SETTING_VALUES[setting]],
	default: valueFor(setting, undefined) ?? null,
	skip: skipLine(notValid(setting)),
	...settingTexts(setting, SETTING_VALUES[setting], HERMES_SETTINGS),
});

// The key holders and the lines of each combination of values, nested by the value of each setting in order.
// The list `settings`, each leaf's `lines` and the command's index agree by position, because all three come from HERMES_SETTINGS.
function choices(
	remaining: readonly HermesSetting[],
	stored: Stored,
): JsonObject {
	const [setting, ...rest] = remaining;
	if (setting === undefined)
		return {
			holders: [...holders(settingsOf(stored))],
			lines: HERMES_SETTINGS.map((each) => valueLine(each, stored)),
		};
	return Object.fromEntries(
		SETTING_VALUES[setting].map((value) => [
			value,
			choices(rest, { ...stored, [setting]: value }),
		]),
	);
}

const LAST_CODE_POINT = 0x10ffff;
const SURROGATES = { first: 0xd800, last: 0xdfff };

// The code points the core reads as blank, by asking isSilent. Numbers, so the generated file holds no invisible character.
const blankCodePoints = (): number[] =>
	Array.from({ length: LAST_CODE_POINT + 1 }, (_, code) => code).filter(
		(code) =>
			(code < SURROGATES.first || code > SURROGATES.last) &&
			isSilent(String.fromCodePoint(code)),
	);

// What the Python shim needs and must not retype: the limits, the provider rules, the efforts, the finished skip lines and the pinned labels.
const constants = (source: Source): JsonObject => {
	const { graceMs, reasons } = HERMES_TEXTS;
	return {
		routingLimitMs: ROUTING_LIMIT_MS,
		graceMs,
		blank: blankCodePoints(),
		keyVariables: { ...KEY_VARIABLES },
		settings: HERMES_SETTINGS.map(settingEntry),
		choices: choices(HERMES_SETTINGS, {}),
		efforts: [...EFFORTS],
		skips: Object.fromEntries(
			Object.entries(reasons).map(([key, reason]) => [key, skipLine(reason)]),
		),
		slots: slotRecord((slot) => ({
			setting: slotSetting(slot),
			pinned: { unset: pinnedLabel(slot) },
		})),
		levels: [...LEVELS],
		// Indexed by level: the slot each level takes its model from.
		levelSlots: LEVELS.map(slotForLevel),
		...taskParameterTexts(source.hermes.pluginName),
		backend: source.hermes.backendName,
		texts: setupTexts(),
	};
};

export const renderHermes = (source: Source): Rendered[] => [
	{ path: HERMES_OUTPUTS.manifest, text: yamlText(manifest(source)) },
	{ path: HERMES_OUTPUTS.constants, text: serialize(constants(source)) },
];
