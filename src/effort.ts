import type { Level, Part, Probabilities } from "./model.ts";

const WORK_PRIOR = [0.5, 1, 0.5] as const;
const WORK_INSTRUCTIONS =
	"How much work does completing `task` take for an agent whose role is `role`, once the judgment is settled? Count the steps, the files and the edge cases to verify.";

export const WORK_TEXTS = [
	"A short task: one or two mechanical steps in one place, nothing to diagnose, and the given command is the whole check.",
	"An ordinary task: reading or diagnosing code, a few steps or files, and a result to verify.",
	"A long or delicate task: many steps or files, hidden edge cases, or a wrong result that would look right.",
] as const;

// The middle is the resting point: an end wins only with more than twice its probability. Equal ends go to the heavier one.
function pickWork(p: Probabilities): Level {
	let best: Level = 1;
	for (const i of [2, 0] as Level[]) {
		if (p[i] * WORK_PRIOR[i] > p[best] * WORK_PRIOR[best]) best = i;
	}
	return best;
}

export const work: Part = {
	key: "work",
	question: {
		type: "score",
		instructions: WORK_INSTRUCTIONS,
		criteria: WORK_TEXTS,
	},
	pick: pickWork,
};
