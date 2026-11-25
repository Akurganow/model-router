import { type JsonObject, type Rendered, serialize } from "./json.ts";
import { OPENCLAW_OUTPUTS } from "./outputs.ts";
import { optionText, type Source } from "./source.ts";
import {
	defaultOf,
	KEY_FIELDS,
	keyEntries,
	SLOT_SETTINGS,
	TOOL_NAME,
	VALUE_SETTINGS,
} from "./values.ts";

// The fields below follow docs/plugins/manifest.md of OpenClaw 2026.10.10 and the pages it links.
const SECRET_KEYS = Object.values(KEY_FIELDS);
const SECRET_EXPECTED = "string";

// manifest.md, "JSON Schema requirements": the config is validated against this schema before the plugin loads.
// The value settings carry no enumeration: OpenClaw then accepts any string, and the code skips the routing for a text that names no value.
const configSchema = (source: Source): JsonObject => ({
	type: "object",
	additionalProperties: false,
	properties: {
		...Object.fromEntries(
			VALUE_SETTINGS.map((setting) => [
				setting,
				{
					type: source.openclaw.settingType,
					default: defaultOf(setting),
				},
			]),
		),
		// A string, or an object of provider to model, so a value typed as text and one set as a map both pass the validation.
		models: {
			type: ["string", "object"],
			additionalProperties: { type: source.openclaw.settingType },
		},
		...Object.fromEntries(
			[...SLOT_SETTINGS, ...SECRET_KEYS].map((name) => [
				name,
				{ type: source.openclaw.settingType },
			]),
		),
	},
});

// manifest/setup-and-auth.md, "uiHints reference": label, help and sensitive.
const uiHints = (source: Source): JsonObject => ({
	...Object.fromEntries(
		VALUE_SETTINGS.map((setting) => [
			setting,
			{
				label: source.options[setting].title,
				help: optionText(source, "openclaw", setting),
			},
		]),
	),
	models: {
		label: source.models.title,
		help: source.models.descriptions.openclaw,
	},
	...source.openclaw.uiHints,
	...keyEntries(source.openclaw.keys),
});

// manifest/config-and-secrets.md, "secretInputs paths": the only accepted `expected` is "string".
const secretInputs = (): JsonObject => ({
	paths: SECRET_KEYS.map((path) => ({
		path,
		expected: SECRET_EXPECTED,
	})),
});

// manifest.md, "Top-level field reference": id and configSchema are required; name, description, version and skills are optional.
// manifest/capabilities.md: `activation.onStartup` loads the plugin with the gateway, and `contracts.tools` must match `api.registerTool`.
const manifest = (source: Source): JsonObject => ({
	id: source.openclaw.pluginId,
	name: source.openclaw.name,
	description: source.descriptions.openclaw.manifest,
	version: source.version,
	activation: { onStartup: true },
	contracts: { tools: [TOOL_NAME] },
	skills: [...source.openclaw.skills],
	configContracts: { secretInputs: secretInputs() },
	uiHints: uiHints(source),
	configSchema: configSchema(source),
});

export const renderOpenclaw = (source: Source): Rendered[] => [
	{ path: OPENCLAW_OUTPUTS.manifest, text: serialize(manifest(source)) },
];
