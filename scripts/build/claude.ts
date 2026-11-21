import { type JsonObject, oneLine, type Rendered, serialize } from "./json.ts";
import { CLAUDE_OUTPUTS } from "./outputs.ts";
import { optionText, type Source } from "./source.ts";
import {
	COMMAND_DESCRIPTIONS,
	KEY_FIELDS,
	KEY_HOLDERS,
	SETTING_VALUES,
	VALUE_SETTINGS,
	valueFor,
} from "./values.ts";

const commands = (source: Source): JsonObject =>
	Object.fromEntries(
		VALUE_SETTINGS.map((setting) => [
			setting,
			{
				description: COMMAND_DESCRIPTIONS[setting],
				argumentHint: `[${SETTING_VALUES[setting].join("|")}]`,
				content: source.claude.commandContents[setting],
			},
		]),
	);

const userConfig = (source: Source): JsonObject => ({
	...Object.fromEntries(
		KEY_HOLDERS.map((holder) => [
			KEY_FIELDS[holder],
			source.claude.userConfig.keys[holder],
		]),
	),
	...Object.fromEntries(
		VALUE_SETTINGS.map((setting) => {
			const option = source.options[setting];
			return [
				setting,
				{
					type: source.claude.userConfig.optionType,
					title: option.title,
					description: optionText(source, "claude", setting),
					options: [...SETTING_VALUES[setting]],
					default: valueFor(setting, undefined) ?? null,
				},
			];
		}),
	),
});

const manifest = (source: Source): JsonObject => ({
	name: source.name,
	version: source.version,
	description: source.descriptions.claude.manifest,
	author: { ...source.author },
	license: source.license,
	homepage: source.homepage,
	repository: source.repository,
	privacyPolicyUrl: source.privacyPolicyUrls.claude,
	keywords: [...source.keywords],
	skills: [...source.claude.skills],
	commands: commands(source),
	userConfig: userConfig(source),
});

const catalogue = (source: Source): JsonObject => ({
	name: source.name,
	owner: oneLine({ name: source.author.name }),
	description: source.descriptions.claude.catalogue,
	plugins: [
		oneLine({ name: source.name, source: source.claude.catalogueSource }),
	],
});

export const renderClaude = (source: Source): Rendered[] => [
	{ path: CLAUDE_OUTPUTS.manifest, text: serialize(manifest(source)) },
	{ path: CLAUDE_OUTPUTS.catalogue, text: serialize(catalogue(source)) },
];
