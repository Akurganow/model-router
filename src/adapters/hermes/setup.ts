import { slotLine } from "#core/decision/slots.ts";
import {
	alreadyValue,
	COMMAND_DESCRIPTIONS,
	commandName,
	keyLine,
	readOnlyToolDescription,
	TOOL_LABEL,
	TOOL_NAME,
	unchanged,
	useOneOf,
	type ValueSetting,
	valueLine,
} from "#core/options/settings.ts";
import { KEY_HOLDERS, type KeyHolder } from "#core/providers/provider.ts";
import { MODELS_COMMAND, MODELS_UNAVAILABLE } from "./texts.ts";

// Hermes puts a plugin tool in a toolset of its own, and a plugin toolset is on in a default session.
const TOOLSET = "model_router";
const UNSET = "unset";
const NOT_LOCAL = "only a local session can change it";
// The platform names Hermes passes to a command from a session on the same machine.
const LOCAL_PLATFORMS = ["local", "cli", "tui", "desktop"] as const;

const LINE_BREAK = "\n";
// Python fills the slot's provider and model into the report line.
const MODEL_SHOWN = "{provider} {model}";

const toolDescription = (): string =>
	readOnlyToolDescription(["the provider", "the gateway", "the three models"]);

// A text that Python fills in with the text the person stored.
const STORED = "{stored}";

const states = (holder: KeyHolder) => ({
	set: keyLine(holder, "set"),
	unset: keyLine(holder, "unset"),
});

/**
 * Returns the texts of one value setting. `hermesSettings` is every setting
 * Hermes stores. The gateway line names the key holders only when every setting
 * is valid, so a value's line here is the one it prints when the others are not.
 * The placeholder is not a value of any setting, so `valueLine` reads the other
 * settings as not valid and the gateway line names no holder.
 */
export function settingTexts(
	setting: ValueSetting,
	values: readonly string[],
	hermesSettings: readonly ValueSetting[],
) {
	const others = Object.fromEntries(
		hermesSettings.map((other) => [other, STORED]),
	);
	return {
		notValid: valueLine(setting, { [setting]: STORED }),
		valueLines: Object.fromEntries(
			values.map((value) => [
				value,
				valueLine(setting, { ...others, [setting]: value }),
			]),
		),
		useOneOf: useOneOf(setting),
		already: Object.fromEntries(
			values.map((value) => [value, unchanged(setting, alreadyValue(value))]),
		),
		unchanged: unchanged(setting, ""),
		refused: unchanged(setting, NOT_LOCAL),
		command: {
			name: commandName(setting),
			description: COMMAND_DESCRIPTIONS[setting],
			argsHint: `<${values.join("|")}>`,
		},
	};
}

/**
 * The texts the Hermes setup tool and command print besides the settings', built
 * from the shared builders so no harness words a setting differently. The
 * builder writes them to constants.json, and the Python shim fills the templates
 * and copies nothing.
 */
export function setupTexts() {
	return {
		toolName: TOOL_NAME,
		toolset: TOOLSET,
		toolLabel: TOOL_LABEL,
		toolDescription: toolDescription(),
		localPlatforms: [...LOCAL_PLATFORMS],
		keyLines: Object.fromEntries(
			KEY_HOLDERS.map((name) => [name, states(name)]),
		),
		modelsCommand: MODELS_COMMAND,
		modelsUnavailable: MODELS_UNAVAILABLE,
		unset: UNSET,
		modelLine: slotLine("{name}", MODEL_SHOWN),
		modelUnset: slotLine("{name}"),
		lineBreak: LINE_BREAK,
		errorPrefix: "error: ",
	};
}
