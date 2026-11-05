import { PROVIDER_VALUES } from "../../src/provider.ts";
import { SCOPE_VALUES } from "../../src/scope.ts";
import type { ValueSetting } from "../../src/settings.ts";

// The value lists live in src/, so a manifest can never name a value the code does not know.
export const SETTING_VALUES: Readonly<Record<ValueSetting, readonly string[]>> =
	{ provider: PROVIDER_VALUES, scope: SCOPE_VALUES };
