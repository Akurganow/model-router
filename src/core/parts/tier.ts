import { fromMiddle, type Part } from "./part.ts";

// Fitted on calibration.jsonl, see plugins/model-router/docs/model-choice.md.
const TIER_DOWN = 2 ** 0.25;
const TIER_UP = 2 ** 0.5;

const TIER_INSTRUCTIONS =
	"How much judgment does completing `task` require from an agent whose role is `role`? `description` is the caller's one-line summary of the task.";

export const TIER_TEXTS = [
	"Lookup or transcription: the brief names the exact files to read or string to find, or holds the exact code, config or prose to write. It gives the commands to run and the check that proves the work done. No choice is left.",
	"Bounded judgment: the brief fixes the goal, and whatever it leaves open is routine. Check work against stated requirements, fix named defects, implement from a given plan or spec, or answer a question from a few named files.",
	"Open judgment: the part the brief leaves open is hard to get right, or a wrong choice there would be easy to miss. Make a design decision that other work depends on, find a cause the symptom does not show, solve a problem with no standard method, or judge risks and flaws that are easy to miss.",
] as const;

export const tier: Part = {
	key: "tier",
	question: {
		type: "score",
		instructions: TIER_INSTRUCTIONS,
		criteria: TIER_TEXTS,
	},
	pick: fromMiddle(TIER_DOWN, TIER_UP),
};
