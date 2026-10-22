export const BUDGET_CHARS = 12000;
export const OMISSION_MARKER = "\n[middle of the brief omitted]\n";

const HEAD_SHARE = 2 / 3;
const CONTEXT_CAP_CHARS = 3000;
const CONTEXT_MIN_CHARS = 500;
const CONTEXT_LABEL = "\n\nBatch context:\n";

// The task text goes to a third party, and nothing marks which strings are secrets, so redaction matches shapes.
const REDACT_PATTERNS: readonly [RegExp, string][] = [
	[/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer ***"],
	[/\bsk-[A-Za-z0-9_-]{8,}/g, "***"],
	[
		/\b([A-Za-z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD))(["']?\s*[=:]\s*)(?:"[^"]*"?|'[^']*'?|[^\s"']+)/gi,
		"$1$2***",
	],
];

// Redaction runs on the full text, so a cut can never split a secret into an unmasked piece.
export function prepareBrief(text: string, budget = BUDGET_CHARS): string {
	const condensed = condense(redact(text));
	if (condensed.length <= budget) return condensed;
	const kept = budget - OMISSION_MARKER.length;
	const head = Math.floor(kept * HEAD_SHARE);
	const tail = kept - head;
	return `${condensed.slice(0, head)}${OMISSION_MARKER}${condensed.slice(condensed.length - tail)}`;
}

function condense(text: string): string {
	return text
		.replace(/```[^\n]*\n([\s\S]*?)```/g, (_, block: string) => {
			const lines = block.replace(/\n$/, "").split("\n").length;
			return `[an exact block of ${lines} lines is given verbatim]`;
		})
		.replace(/\n{3,}/g, "\n\n");
}

function redact(text: string): string {
	return REDACT_PATTERNS.reduce(
		(t, [pattern, replacement]) => t.replace(pattern, replacement),
		text,
	);
}

// The context goes after the task and never takes room from it. The label counts against the budget, so prepareBrief's own cut leaves the joined text whole.
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
