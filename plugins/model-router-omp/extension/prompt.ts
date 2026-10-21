import { BUDGET_CHARS, prepareBrief } from "./core.ts";

const CONTEXT_CAP_CHARS = 3000;
const CONTEXT_MIN_CHARS = 500;
const CONTEXT_LABEL = "\n\nBatch context:\n";

// The context goes after the task and never takes room from it. The label counts against the budget, so the core's own preparation leaves the joined text whole.
export function buildPrompt(task: string, context: string): string {
	const brief = prepareBrief(task);
	const budget = Math.min(
		BUDGET_CHARS - brief.length - CONTEXT_LABEL.length,
		CONTEXT_CAP_CHARS,
	);
	if (context === "" || budget < CONTEXT_MIN_CHARS) return brief;
	return `${brief}${CONTEXT_LABEL}${prepareBrief(context, budget)}`;
}

export function contextText(context: unknown): string {
	return typeof context === "string" && context.trim() !== "" ? context : "";
}
