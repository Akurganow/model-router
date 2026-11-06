import { ROUTING_LIMIT_MS } from "../../src/compose.ts";
import { setupTexts } from "../../src/hermes-setup.ts";
import { HERMES_TEXTS } from "../../src/hermes-texts.ts";
import { effortFor } from "../../src/ladder.ts";
import { LINE_PREFIX, skippedLine } from "../../src/line.ts";
import { LEVELS } from "../../src/part.ts";
import {
	KEY_VARIABLES,
	order,
	PROVIDER_VALUES,
	resolve as resolveProvider,
} from "../../src/provider.ts";
import {
	type EndSlot,
	modelUnresolved,
	SLOTS,
	slotSetting,
} from "../../src/reasons.ts";
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
	small_model: {
		type: "dict",
		...describe(source.hermes.settings.small_model),
	},
	large_model: {
		type: "dict",
		...describe(source.hermes.settings.large_model),
	},
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

// Every effort the ladder can return, in the order of first use.
const efforts = (): string[] => [
	...new Set(LEVELS.flatMap((t) => LEVELS.map((w) => effortFor(t, w)))),
];

const skipLine = (reason: string): string =>
	`${LINE_PREFIX}${skippedLine(reason)}`;

// The skips key of the line a slot gives when its model does not resolve.
const unresolvedKey = (slot: EndSlot): string => `${slot}ModelUnresolved`;

// What the Python shim needs and must not retype: the limits, the provider rules, the efforts and the finished skip lines. A slot names the skip line it gives, never holds one.
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
		efforts: efforts(),
		skips: Object.fromEntries([
			...Object.entries(reasons).map(([key, reason]) => [
				key,
				skipLine(reason),
			]),
			...SLOTS.map((slot) => [
				unresolvedKey(slot),
				skipLine(modelUnresolved(slot)),
			]),
		]),
		slots: Object.fromEntries(
			SLOTS.map((slot) => [
				slot,
				{
					setting: slotSetting(slot),
					unresolved: unresolvedKey(slot),
				},
			]),
		),
		backend: source.hermes.backendName,
		texts: setupTexts(source.hermes.pluginName),
	};
};

export const renderHermes = (source: Source): Rendered[] => [
	{ path: HERMES_OUTPUTS.manifest, text: yamlText(manifest(source)) },
	{ path: HERMES_OUTPUTS.constants, text: serialize(constants(source)) },
];
