export const SCOPE_VALUES = ["core", "extended"] as const;
export type Scope = (typeof SCOPE_VALUES)[number];

export const DEFAULT_SCOPE: Scope = SCOPE_VALUES[0];
