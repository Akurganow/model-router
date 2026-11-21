import { SLOT_SETTINGS, type SlotSetting } from "#core/decision/slots.ts";
import { SCOPE_VALUES } from "#core/options/scope.ts";
import {
	COMMAND_DESCRIPTIONS,
	TOOL_NAME,
	VALUE_SETTINGS,
	type ValueSetting,
} from "#core/options/settings.ts";
import {
	KEY_FIELDS,
	type KeyHolder,
	PROVIDER_VALUES,
} from "#core/providers/provider.ts";

// Every fact the renderers take from src/ comes through this module, so a
// manifest can never name a value or a command text the code does not know.
export {
	COMMAND_DESCRIPTIONS,
	KEY_FIELDS,
	type KeyHolder,
	SLOT_SETTINGS,
	type SlotSetting,
	TOOL_NAME,
	VALUE_SETTINGS,
	type ValueSetting,
};

export const SETTING_VALUES: Readonly<Record<ValueSetting, readonly string[]>> =
	{ provider: PROVIDER_VALUES, scope: SCOPE_VALUES };
