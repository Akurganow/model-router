import { SLOT_SETTINGS, type SlotSetting } from "#core/decision/slots.ts";
import { SCOPE_VALUES } from "#core/options/scope.ts";
import {
	COMMAND_DESCRIPTIONS,
	TOOL_NAME,
	VALUE_SETTINGS,
	type ValueSetting,
	valueFor,
} from "#core/options/settings.ts";
import {
	GATEWAYS,
	KEY_FIELDS,
	type KeyHolder,
	MAKERS,
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
	valueFor,
};

export const SETTING_VALUES: Readonly<Record<ValueSetting, readonly string[]>> =
	{ provider: MAKERS, gateway: GATEWAYS, scope: SCOPE_VALUES };

export type Harness = "claude" | "omp" | "openclaw" | "hermes";

// The value settings each harness stores. Hermes has no scope setting, and this table is the one place that says so.
export const HARNESS_SETTINGS = {
	claude: VALUE_SETTINGS,
	omp: VALUE_SETTINGS,
	openclaw: VALUE_SETTINGS,
	hermes: ["provider", "gateway"],
} as const satisfies Readonly<Record<Harness, readonly ValueSetting[]>>;
