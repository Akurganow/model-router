import { slotLine } from "#core/decision/slots.ts";
import {
	alreadyValue,
	commandName,
	keyLine,
	readOnlyToolDescription,
	TOOL_LABEL,
	TOOL_NAME,
	unchanged,
} from "#core/options/settings.ts";
import { KEY_HOLDERS, type KeyHolder } from "#core/providers/provider.ts";
import {
	PROVIDER_COMMAND_DESCRIPTION,
	PROVIDER_USE_ONE_OF,
	providerLine,
	STORED_VALUES,
} from "./stored.ts";

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
	readOnlyToolDescription(["the provider", "the three models"]);

const states = (holder: KeyHolder) => ({
	set: keyLine(holder, "set"),
	unset: keyLine(holder, "unset"),
});

/**
 * Every text the Hermes setup tool and command print, built from the shared
 * builders so no harness words a setting differently. The builder writes them
 * to constants.json, and the Python shim fills the templates and copies nothing.
 */
export function setupTexts() {
	return {
		toolName: TOOL_NAME,
		toolset: TOOLSET,
		toolLabel: TOOL_LABEL,
		toolDescription: toolDescription(),
		commandName: commandName("provider"),
		commandDescription: PROVIDER_COMMAND_DESCRIPTION,
		argsHint: `<${STORED_VALUES.join("|")}>`,
		providerLines: Object.fromEntries(
			STORED_VALUES.map((value) => [value, providerLine(value)]),
		),
		useOneOf: PROVIDER_USE_ONE_OF,
		unchangedPrefix: unchanged("provider", ""),
		already: Object.fromEntries(
			STORED_VALUES.map((value) => [
				value,
				unchanged("provider", alreadyValue(value)),
			]),
		),
		refused: unchanged("provider", NOT_LOCAL),
		localPlatforms: [...LOCAL_PLATFORMS],
		keyLines: Object.fromEntries(
			KEY_HOLDERS.map((name) => [name, states(name)]),
		),
		unset: UNSET,
		modelLine: slotLine("{name}", MODEL_SHOWN),
		modelUnset: slotLine("{name}"),
		lineBreak: LINE_BREAK,
		errorPrefix: "error: ",
	};
}
