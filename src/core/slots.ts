import type { Level } from "./part.ts";

// The slots in level order: level 0 takes its model from small, 1 from middle, 2 from large.
export const SLOTS = ["small", "middle", "large"] as const;
export type Slot = (typeof SLOTS)[number];
export const slotForLevel = (level: Level): Slot => SLOTS[level];
export type SlotSetting = `${Slot}_model`;
export const slotSetting = (slot: Slot): SlotSetting => `${slot}_model`;

// What an adapter knows of one slot: a model it can apply, a model the harness cannot run, or none.
export type SlotModel =
	| { readonly state: "set"; readonly model: string }
	| { readonly state: "unresolved" | "unset" };
export type SlotModels = Readonly<Record<Slot, SlotModel>>;

// A slot with no model keeps the harness's model, so the line names the slot and its state in place of a model.
export type Picked = {
	readonly slot: Slot;
	readonly model: string | undefined;
	readonly target: string;
};
export function pickModel(level: Level, models: SlotModels): Picked {
	const slot = slotForLevel(level);
	const picked = models[slot];
	return picked.state === "set"
		? { slot, model: picked.model, target: picked.model }
		: { slot, model: undefined, target: `${slot} model ${picked.state}` };
}

export const slotLine = (
	name: string,
	state: SlotModel["state"],
	shown: string,
): string => {
	if (state === "unset") return `${name}: unset`;
	return state === "set"
		? `${name}: ${shown}`
		: `${name}: ${shown} (unresolved)`;
};
