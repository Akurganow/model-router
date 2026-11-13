import { setupTexts } from "../../src/adapters/hermes/setup.ts";
import {
	HERMES_TEXTS,
	taskParameterTexts,
} from "../../src/adapters/hermes/texts.ts";
import { ROUTING_LIMIT_MS } from "../../src/core/compose.ts";
import { EFFORTS } from "../../src/core/ladder.ts";
import { LINE_PREFIX, pinnedLine, skippedLine } from "../../src/core/line.ts";
import { LEVELS, type Level } from "../../src/core/part.ts";
import {
	KEY_VARIABLES,
	order,
	PROVIDER_VALUES,
	resolve as resolveProvider,
} from "../../src/core/provider.ts";
import {
	pickModel,
	SLOT_SETTINGS,
	type Slot,
	slotForLevel,
	slotRecord,
	slotSetting,
} from "../../src/core/slots.ts";
import { type JsonObject, type Rendered, serialize } from "./json.ts";
import { HERMES_OUTPUTS } from "./outputs.ts";
import type { Source } from "./source.ts";
import { TOOL_NAME } from "./values.ts";

// Hermes reads plugin.yaml with yaml.safe_load, which refuses a tab, and the version check reads it as JSON, so it is JSON text with space indentation.
const yamlText = (value: JsonObject): string =>
	`${JSON.stringify(value, null, 2)}\n`;

const describe = (hint: { label: string; help: string }) => ({
	label: hint.label,
	description: hint.help,
});

// config_schema follows the Hermes plugin manifest: a type per setting, choices on a str, and an env name on a secret.
const configSchema = (source: Source): JsonObject => ({
	provider: {
		type: "str",
		choices: [...PROVIDER_VALUES],
		default: source.options.provider.default,
		label: source.options.provider.title,
		description: source.options.provider.descriptions.hermes,
	},
	...Object.fromEntries(
		SLOT_SETTINGS.map((setting) => [
			setting,
			{ type: "dict", ...describe(source.hermes.settings[setting]) },
		]),
	),
	typesafe_api_key: {
		type: "secret",
		env: KEY_VARIABLES.typesafe,
		...describe(source.hermes.settings.typesafe_api_key),
	},
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
const pinnedLabel = (slot: Slot, state: "unset" | "unresolved"): string =>
	LINE_PREFIX +
	pinnedLine(levelOf(slot), pickModel(levelOf(slot), { state }).target);

// What the Python shim needs and must not retype: the limits, the provider rules, the efforts, the finished skip lines and the pinned labels.
const constants = (source: Source): JsonObject => {
	const { graceMs, reasons } = HERMES_TEXTS;
	return {
		routingLimitMs: ROUTING_LIMIT_MS,
		graceMs,
		providers: {
			values: [...PROVIDER_VALUES],
			default: resolveProvider(undefined),
			order: Object.fromEntries(PROVIDER_VALUES.map((v) => [v, [...order(v)]])),
			keyVariables: { ...KEY_VARIABLES },
		},
		efforts: [...EFFORTS],
		skips: Object.fromEntries(
			Object.entries(reasons).map(([key, reason]) => [key, skipLine(reason)]),
		),
		slots: slotRecord((slot) => ({
			setting: slotSetting(slot),
			pinned: {
				unset: pinnedLabel(slot, "unset"),
				unresolved: pinnedLabel(slot, "unresolved"),
			},
		})),
		levels: [...LEVELS],
		// Indexed by level: the slot each level takes its model from.
		levelSlots: LEVELS.map(slotForLevel),
		...taskParameterTexts(source.hermes.pluginName),
		backend: source.hermes.backendName,
		texts: setupTexts(source.hermes.pluginName),
	};
};

export const renderHermes = (source: Source): Rendered[] => [
	{ path: HERMES_OUTPUTS.manifest, text: yamlText(manifest(source)) },
	{ path: HERMES_OUTPUTS.constants, text: serialize(constants(source)) },
];
