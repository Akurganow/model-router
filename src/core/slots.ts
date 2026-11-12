import type { Level } from "./part.ts";
import { modelUnset } from "./reasons.ts";

// An end tier names its slot in the skip text and the setting that holds its model.
export const SLOTS = ["small", "large"] as const;
export type EndSlot = (typeof SLOTS)[number];
// The slot each end level takes its model from. The middle level changes no model and names none.
export const LEVEL_SLOTS: Readonly<Record<0 | 2, EndSlot>> = {
	0: "small",
	2: "large",
};
export const slotForLevel = (level: Level): EndSlot | null =>
	level === 1 ? null : LEVEL_SLOTS[level];
export type SlotSetting = `${EndSlot}_model`;
export const slotSetting = (slot: EndSlot): SlotSetting => `${slot}_model`;

// What a level does to the model: the middle keeps it, an end level names its slot and model, or its slot has no model.
type LevelModel =
	| { readonly slot: null; readonly model?: undefined }
	| { readonly slot: EndSlot; readonly model: string }
	| { readonly skipped: string };
export const modelForLevel = (
	level: Level,
	models: Readonly<Record<EndSlot, string | undefined>>,
): LevelModel => {
	const slot = slotForLevel(level);
	if (slot === null) return { slot };
	const model = models[slot];
	return model === undefined ? { skipped: modelUnset(slot) } : { slot, model };
};
