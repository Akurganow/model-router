// The skip reasons and the effort label that more than one harness prints.
export const CONFIG_EFFORT = "config effort";
export const SUBAGENT_MODEL_SET = "subagent model set";
export const NO_END_MODEL = "no small or large model";

// An end tier names its slot in the skip text and the setting that holds its model.
export const SLOTS = ["small", "large"] as const;
export type EndSlot = (typeof SLOTS)[number];
export type SlotSetting = `${EndSlot}_model`;
export const slotSetting = (slot: EndSlot): SlotSetting => `${slot}_model`;
export const modelUnset = (slot: EndSlot): string => `${slot} model unset`;
export const modelUnresolved = (slot: EndSlot): string =>
	`${slot} model unresolved`;
