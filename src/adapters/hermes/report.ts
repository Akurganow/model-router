import { modelsLines } from "#core/options/settings.ts";
import { isRecord } from "#utils/guards.ts";
import { MODELS_COMMAND, MODELS_SETTING } from "./texts.ts";

export type ModelsCommand = {
	readonly command: typeof MODELS_COMMAND;
	// The stored `models` value as Hermes gave it, unchecked.
	readonly [MODELS_SETTING]?: unknown;
};

export function isModelsCommand(raw: unknown): raw is ModelsCommand {
	if (!isRecord(raw)) return false;
	const { command } = raw;
	return command === MODELS_COMMAND;
}

/**
 * Returns the lines the config tool prints for the `models` setting, the same
 * lines every harness prints: the stored value, then the model of each provider,
 * or the part of the value that is not valid. Never throws.
 */
export const modelsReport = (
	command: ModelsCommand,
): { readonly lines: string[] } => ({
	lines: modelsLines({ [MODELS_SETTING]: command[MODELS_SETTING] }),
});
