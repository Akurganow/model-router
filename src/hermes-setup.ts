import { PROVIDERS } from "./hermes-request.ts";
import { commandName, TOOL_NAME } from "./openclaw-config.ts";
import { KEY_VARIABLES, PROVIDER_VALUES, type Provider } from "./provider.ts";
import { SLOTS, type SlotSetting, slotSetting } from "./reasons.ts";
import {
	alreadyValue,
	badCall,
	COMMAND_DESCRIPTIONS,
	keyLine,
	TOOL_LABEL,
	unchanged,
	useOneOf,
	valueLine,
} from "./settings.ts";

const SLOT_SETTINGS = SLOTS.map(slotSetting);
const SETTINGS = [
	"provider",
	"typesafe_key",
	"openrouter_key",
	...SLOT_SETTINGS,
] as const;

// Hermes puts a plugin tool in a toolset of its own, and a plugin toolset is on in a default session.
const TOOLSET = "model_router";
const UNSET = "unset";
export const NOT_LOCAL = "only a local session can change it";
// The platform names Hermes passes to a command from a session on the same machine.
const LOCAL_PLATFORMS = ["local", "cli", "tui", "desktop"] as const;

const LINE_BREAK = "\n";
const NEVER_IN_CHAT = "Never type a key into the chat.";

const toolDescription = (): string =>
	`Reads the router's settings. With no input it returns the provider, both models, and whether each key the provider allows is set. With a setting name (${SETTINGS.join(", ")}) it returns how the person changes that setting. It changes nothing and never returns a key.`;

// Only the TypeSafe key is a plugin setting; Hermes reads the OpenRouter key from the environment alone.
const ENV_FILE = "in the .env file of the Hermes home";
const typesafeKeyHelp = (): string =>
	`Set ${KEY_VARIABLES.typesafe} ${ENV_FILE}, or enter the key in the plugin's settings form in Hermes Desktop. ${NEVER_IN_CHAT}`;
const openrouterKeyHelp = (): string =>
	`Set ${KEY_VARIABLES.openrouter} ${ENV_FILE}. ${NEVER_IN_CHAT}`;

const slotHelp = (slot: SlotSetting, pluginName: string): string =>
	`${slot} is set in the plugin's settings form in Hermes Desktop, or in config.yaml under plugins.entries.${pluginName}.settings.${slot}, or with: hermes config set plugins.entries.${pluginName}.settings.${slot} '{"provider": "<provider>", "model": "<model>"}'`;

const providerHelp = (): string =>
	[
		`Type /${commandName("provider")} <value> in the chat.`,
		useOneOf("provider"),
	].join(LINE_BREAK);

const states = (provider: Provider) => ({
	set: keyLine(provider, "set"),
	unset: keyLine(provider, "unset"),
});

/**
 * Every text the Hermes setup tool and command print, built from the shared
 * builders so no harness words a setting differently. The builder writes them
 * to constants.json, and the Python shim fills the templates and copies nothing.
 */
export function setupTexts(pluginName: string) {
	return {
		toolName: TOOL_NAME,
		toolset: TOOLSET,
		toolLabel: TOOL_LABEL,
		toolDescription: toolDescription(),
		settings: [...SETTINGS],
		commandName: commandName("provider"),
		commandDescription: COMMAND_DESCRIPTIONS.provider,
		argsHint: `<${PROVIDER_VALUES.join("|")}>`,
		providerLines: Object.fromEntries(
			PROVIDER_VALUES.map((value) => [value, valueLine("provider", value)]),
		),
		useOneOf: useOneOf("provider"),
		unchangedPrefix: unchanged("provider", ""),
		already: Object.fromEntries(
			PROVIDER_VALUES.map((value) => [
				value,
				unchanged("provider", alreadyValue(value)),
			]),
		),
		refused: unchanged("provider", NOT_LOCAL),
		localPlatforms: [...LOCAL_PLATFORMS],
		badCall: badCall(SETTINGS),
		keyLines: Object.fromEntries(PROVIDERS.map((name) => [name, states(name)])),
		unset: UNSET,
		modelLine: "{name}: {provider} {model}",
		modelUnset: `{name}: ${UNSET}`,
		lineBreak: LINE_BREAK,
		errorPrefix: "error: ",
		help: {
			provider: providerHelp(),
			typesafe_key: typesafeKeyHelp(),
			openrouter_key: openrouterKeyHelp(),
			...Object.fromEntries(
				SLOT_SETTINGS.map((slot) => [slot, slotHelp(slot, pluginName)]),
			),
		},
	};
}
