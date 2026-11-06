// The skip reasons and the effort label that more than one harness prints.
export const CONFIG_EFFORT = "config effort";
export const SUBAGENT_MODEL_SET = "subagent model set";
export const NO_END_MODEL = "no small or large model";
export const NODE_NOT_FOUND = "node not found";

// An end tier names its slot in the skip text and the setting that holds its model.
export const SLOTS = ["small", "large"] as const;
export type EndSlot = (typeof SLOTS)[number];
// The slot each end level takes its model from. The middle level changes no model and names none.
export const LEVEL_SLOTS: Readonly<Record<0 | 2, EndSlot>> = {
	0: "small",
	2: "large",
};
export type SlotSetting = `${EndSlot}_model`;
export const slotSetting = (slot: EndSlot): SlotSetting => `${slot}_model`;
export const modelUnset = (slot: EndSlot): string => `${slot} model unset`;
export const modelUnresolved = (slot: EndSlot): string =>
	`${slot} model unresolved`;
