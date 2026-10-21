import {
	type Level,
	type Post,
	type Probabilities,
	type ScoreInput,
	type ScoreOptions,
	type Skipped,
	score,
	TIER_TEXTS,
} from "./core.ts";

export type { Post, Skipped };

export type Model = "haiku" | "sonnet" | "opus";
export type Effort = "low" | "medium" | "high" | "xhigh";
export type RouteInput = ScoreInput;

const TIERS = [
	{ model: "haiku", text: TIER_TEXTS[0] },
	{ model: "sonnet", text: TIER_TEXTS[1] },
	{ model: "opus", text: TIER_TEXTS[2] },
] as const satisfies readonly { model: Model; text: string }[];

// Effort is calibrated per model. Haiku's row sits one step higher: at low it stops early on agentic prompts.
export const EFFORT_LADDER: Record<Model, readonly [Effort, Effort, Effort]> = {
	haiku: ["medium", "high", "xhigh"],
	sonnet: ["low", "medium", "high"],
	opus: ["low", "medium", "high"],
};

export type Decision = {
	model: Model;
	level: Level;
	workIndex: Level;
	effort: Effort;
	probabilities: { tier: Probabilities; work: Probabilities };
};

export async function route(
	input: RouteInput,
	post: Post,
	options?: ScoreOptions,
): Promise<Decision | Skipped> {
	const scored = await score(input, TIER_TEXTS, post, options);
	if ("skipped" in scored) return scored;
	const { level, workIndex, probabilities } = scored;
	const { model } = TIERS[level];
	return {
		model,
		level,
		workIndex,
		effort: EFFORT_LADDER[model][workIndex],
		probabilities,
	};
}
