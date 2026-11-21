import { routingState } from "#core/brief/brief.ts";
import type { Part } from "#core/parts/part.ts";

const part = (key: string, instructions: string): Part => ({
	key,
	question: {
		type: "score",
		instructions,
		criteria: ["low", "middle", "high"],
	},
	pick: () => 1,
});

// Small parts under the real keys let a format test spell its whole body.
export const TIER = part("tier", "Rate tier.");
export const WORK = part("work", "Rate work.");
export const STATE = routingState({
	role: "coder",
	description: "Fix it",
	task: "Fix the bug.",
});
