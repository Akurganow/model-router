import type { Level } from "./part.ts";

// Every effort the ladder gives, weakest first.
export const EFFORTS = ["low", "medium", "high", "xhigh"] as const;
type Effort = (typeof EFFORTS)[number];

// Effort is calibrated per model. The small model's row sits one step higher: at low it stops early on agentic prompts.
const EFFORT_BY_TIER: Record<Level, readonly [Effort, Effort, Effort]> = {
	0: ["medium", "high", "xhigh"],
	1: ["low", "medium", "high"],
	2: ["low", "medium", "high"],
};

export const effortFor = (tier: Level, work: Level): Effort =>
	EFFORT_BY_TIER[tier][work];
