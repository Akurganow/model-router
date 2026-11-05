export const SCOPE_VALUES = ["core", "extended"] as const;
export type Scope = (typeof SCOPE_VALUES)[number];

export const DEFAULT_SCOPE: Scope = "core";

export const parseScope = (value: unknown): Scope | undefined =>
	SCOPE_VALUES.find((known) => known === value);

export const resolveScope = (value: unknown): Scope =>
	parseScope(value) ?? DEFAULT_SCOPE;
