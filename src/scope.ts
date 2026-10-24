export const SCOPE_VALUES = ["core", "extended"] as const;
export type Scope = (typeof SCOPE_VALUES)[number];

export const DEFAULT_SCOPE: Scope = "core";

export const resolveScope = (value: unknown): Scope =>
	SCOPE_VALUES.find((known) => known === value) ?? DEFAULT_SCOPE;
