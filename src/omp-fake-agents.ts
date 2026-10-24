import { TASK_DESCRIPTION } from "./omp-fakes.ts";
import type { DiscoveredAgent } from "./omp-types.ts";

// The agents omp discovers for the extended scope. A bundled model is not a user choice, a user agent's is.
export const AGENTS: readonly DiscoveredAgent[] = [
	{ name: "task", source: "bundled", description: TASK_DESCRIPTION },
	{
		name: "scout",
		source: "bundled",
		model: ["@smol"],
		description: "Reads the code and reports what it finds.",
	},
	{
		name: "sonic",
		source: "bundled",
		model: ["@smol"],
		description: "Makes small, quick edits.",
	},
	{
		name: "reviewer",
		source: "bundled",
		model: ["@slow"],
		description: "Reviews a change for defects.",
	},
	{
		name: "security-reviewer",
		source: "bundled",
		model: ["@slow"],
		description: "Reviews a change for security holes.",
	},
	{
		name: "seance",
		source: "bundled",
		model: ["anthropic/claude-x", "@slow"],
		description: "Recalls earlier sessions.",
	},
	{ name: "helper", source: "user", description: "A user's own helper." },
	{
		name: "pinned",
		source: "user",
		model: ["anthropic/claude-x"],
		description: "A user's agent with its own model.",
	},
];
