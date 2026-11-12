import { fromMiddle, type Part } from "./part.ts";

// Fitted on calibration.jsonl, see plugins/model-router/docs/model-choice.md.
const TIER_DOWN = 2 ** 0.25;
const TIER_UP = 2 ** 0.5;

const TIER_INSTRUCTIONS =
	"How much judgment does completing `task` require from an agent whose role is `role`? `description` is the caller's one-line summary of the task.";

export const TIER_TEXTS = [
	"Lookup or transcription: the brief names the exact files to read or string to find, or holds the exact code, config or prose to write. It gives the commands to run and the check that proves the work done. No choice is left.",
	"Bounded judgment: the brief fixes the goal and a way to check the result. Check work against stated requirements, fix named defects, implement from a given plan or spec, or answer a question from a few named files.",
	"Open judgment: the brief leaves the approach open. Decide a design, create content with no plan or spec to follow, review a multi-file change for risks no checklist names, or debug with an unclear cause.",
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
