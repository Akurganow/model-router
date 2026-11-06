// The skip reasons and the effort label that more than one harness prints.
export const CONFIG_EFFORT = "config effort";
export const SUBAGENT_MODEL_SET = "subagent model set";
export const NO_END_MODEL = "no small or large model";

// An end tier names its slot in the skip text.
export type EndSlot = "small" | "large";
export const modelUnset = (slot: EndSlot): string => `${slot} model unset`;
export const modelUnresolved = (slot: EndSlot): string =>
	`${slot} model unresolved`;
