import { routedLine } from "../output/line.ts";
import type { DecidedWithWork } from "./decide.ts";
import { type Effort, effortFor } from "./ladder.ts";
import {
	pickModel,
	type Slot,
	type SlotModels,
	slotForLevel,
} from "./slots.ts";

export type Outcome = {
	readonly slot: Slot;
	// Undefined when the slot is unset: the harness keeps its own model.
	readonly model: string | undefined;
	// Undefined when the adapter keeps an effort of its own.
	readonly effort: Effort | undefined;
	// The routing line, without a prefix.
	readonly line: string;
};

/**
 * Returns what a scored call comes to: the slot the tier picks, that slot's
 * model, the ladder's effort and the routing line. `kept` labels an effort the
 * adapter keeps. The line then shows the label and `effort` is undefined.
 * Never throws.
 */
export function outcomeOf(
	decided: DecidedWithWork,
	models: SlotModels,
	kept?: string,
): Outcome {
	const picked = pickModel(decided.tier, models[slotForLevel(decided.tier)]);
	const ladder = effortFor(decided.tier, decided.work);
	return {
		slot: picked.slot,
		model: picked.model,
		effort: kept === undefined ? ladder : undefined,
		line: routedLine({
			level: decided.tier,
			target: picked.target,
			effort: kept ?? ladder,
			probabilities: decided.probabilities,
			suffix: decided.suffix,
		}),
	};
}
