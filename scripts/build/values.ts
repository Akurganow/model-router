import { KEY_FIELDS, PROVIDER_VALUES } from "../../src/core/provider.ts";
import { SCOPE_VALUES } from "../../src/core/scope.ts";
import {
	COMMAND_DESCRIPTIONS,
	TOOL_NAME,
	VALUE_SETTINGS,
	type ValueSetting,
} from "../../src/core/settings.ts";

// Every fact the renderers take from src/ comes through this module, so a
// manifest can never name a value or a command text the code does not know.
export {
	COMMAND_DESCRIPTIONS,
	KEY_FIELDS,
	TOOL_NAME,
	VALUE_SETTINGS,
	type ValueSetting,
};

export const SETTING_VALUES: Readonly<Record<ValueSetting, readonly string[]>> =
	{ provider: PROVIDER_VALUES, scope: SCOPE_VALUES };
