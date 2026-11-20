import { fromMiddle, type Part } from "./part.ts";

// Fitted on calibration.jsonl, see plugins/model-router/docs/model-choice.md.
const WORK_DOWN = 2 ** 1.25;
const WORK_UP = 2 ** 0.5;
const WORK_INSTRUCTIONS =
	"How much work does completing `task` take for an agent whose role is `role`, once the judgment is settled? Count the steps, the files and the edge cases to verify.";

export const WORK_TEXTS = [
	"A short task: one or two mechanical steps in one place, nothing to diagnose, and the given command is the whole check.",
	"An ordinary task: reading or diagnosing code, a few steps or files, and a result to verify.",
	"A long or delicate task: many steps or files, hidden edge cases, or a wrong result that would look right.",
] as const;

export const work: Part = {
	key: "work",
	question: {
		type: "score",
		instructions: WORK_INSTRUCTIONS,
		criteria: WORK_TEXTS,
	},
	pick: fromMiddle(WORK_DOWN, WORK_UP),
};
