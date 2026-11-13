import type { Level } from "./part.ts";

// The slots in level order: level 0 takes its model from small, 1 from middle, 2 from large.
export const SLOTS = ["small", "middle", "large"] as const;
export type Slot = (typeof SLOTS)[number];
export const slotForLevel = (level: Level): Slot => SLOTS[level];
export type SlotSetting = `${Slot}_model`;
export const slotSetting = (slot: Slot): SlotSetting => `${slot}_model`;

export const SLOT_SETTINGS: readonly SlotSetting[] = SLOTS.map(slotSetting);

// Builds a record by slot. The one cast lives here, so a caller cannot leave a slot out.
export const slotRecord = <T>(
	make: (slot: Slot) => T,
): Readonly<Record<Slot, T>> =>
	Object.fromEntries(SLOTS.map((slot) => [slot, make(slot)])) as Record<
		Slot,
		T
	>;

// What an adapter knows of one slot: a model it can apply, or none.
export type SlotModel =
	| { readonly state: "set"; readonly model: string }
	| { readonly state: "unset" };
export type SlotModels = Readonly<Record<Slot, SlotModel>>;

// The one rule for a slot's state: no model is unset, a named model is set. The plugin does not check that the model runs.
export const slotState = (model: string | undefined): SlotModel =>
	model === undefined ? { state: "unset" } : { state: "set", model };

// A slot with no model keeps the harness's model, so the line names the slot and says it is unset in place of a model.
type Picked = {
	readonly slot: Slot;
	readonly model: string | undefined;
	readonly target: string;
};
export function pickModel(level: Level, state: SlotModel): Picked {
	const slot = slotForLevel(level);
	return state.state === "set"
		? { slot, model: state.model, target: state.model }
		: { slot, model: undefined, target: `${slot} model unset` };
}

// The report line of one slot: its configured value, or unset.
export const slotLine = (name: string, shown?: string): string =>
	`${name}: ${shown ?? "unset"}`;
