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
	KEY_HOLDERS,
	type KeyHolder,
	MAKERS,
} from "#core/providers/provider.ts";

// Every fact the renderers take from src/ comes through this module, so a
// manifest can never name a value or a command text the code does not know.
export {
	COMMAND_DESCRIPTIONS,
	KEY_FIELDS,
	KEY_HOLDERS,
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

export const HARNESSES = ["claude", "omp", "openclaw", "hermes"] as const;
export type Harness = (typeof HARNESSES)[number];

// The value settings each harness stores. Hermes has no scope setting, and this table is the one place that says so.
export const HARNESS_SETTINGS = {
	claude: VALUE_SETTINGS,
	omp: VALUE_SETTINGS,
	openclaw: VALUE_SETTINGS,
	hermes: ["provider", "gateway"],
} as const satisfies Readonly<Record<Harness, readonly ValueSetting[]>>;

export const storesSetting = (
	harness: Harness,
	setting: ValueSetting,
): boolean => HARNESS_SETTINGS[harness].some((stored) => stored === setting);

// The value a setting reads as when nothing is stored.
export const defaultOf = (setting: ValueSetting): string | null =>
	valueFor(setting, undefined) ?? null;

// One entry per key holder, in KEY_HOLDERS order, under the setting name that holds its key.
export const keyEntries = <T>(
	record: Readonly<Record<KeyHolder, T>>,
): Record<string, T> =>
	Object.fromEntries(
		KEY_HOLDERS.map((holder) => [KEY_FIELDS[holder], record[holder]]),
	);
