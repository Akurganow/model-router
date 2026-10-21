import { BUDGET_CHARS, OMISSION_MARKER, prepareBrief } from "./core.ts";

const CONTEXT_CAP_CHARS = 3000;
const CONTEXT_MIN_CHARS = 500;
const CONTEXT_LABEL = "\n\nBatch context:\n";
const HEAD_SHARE = 2 / 3;

// The core has no budget argument, so this cuts a prepared brief the way it does: head and tail around a marker.
// A cap far below the core's budget keeps the same head and tail as a cut of the full text.
function cutBrief(prepared: string, budget: number): string {
	if (prepared.length <= budget) return prepared;
	const kept = budget - OMISSION_MARKER.length;
	const head = Math.floor(kept * HEAD_SHARE);
	return `${prepared.slice(0, head)}${OMISSION_MARKER}${prepared.slice(prepared.length - (kept - head))}`;
}

// The context goes after the task and never takes room from it. The label counts against the budget, so the core's own preparation leaves the joined text whole.
export function buildPrompt(task: string, preparedContext: string): string {
	const brief = prepareBrief(task);
	const budget = Math.min(
		BUDGET_CHARS - brief.length - CONTEXT_LABEL.length,
		CONTEXT_CAP_CHARS,
	);
	if (preparedContext === "" || budget < CONTEXT_MIN_CHARS) return brief;
	return `${brief}${CONTEXT_LABEL}${cutBrief(preparedContext, budget)}`;
}

export function prepareContext(context: unknown): string {
	return typeof context === "string" && context.trim() !== ""
		? prepareBrief(context)
		: "";
}
