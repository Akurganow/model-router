import { nonEmpty } from "./part.ts";

export const BUDGET_CHARS = 12000;
export const ROLE_CAP = 500;
export const NO_DESCRIPTION = "An agent with no description.";
// Calibration input, like the tier and work texts: only a recalibration changes it, never a harness rewording its agent.
export const DEFAULT_ROLE =
	"General-purpose agent for researching complex questions, searching for code, and executing multi-step tasks. When you are searching for a keyword or file and are not confident that you will find the right match in the first few tries use this agent to perform the search for you.";
export const OMISSION_MARKER = "\n[middle of the brief omitted]\n";

const HEAD_SHARE = 2 / 3;
const CONTEXT_CAP_CHARS = 3000;
const CONTEXT_MIN_CHARS = 500;
const CONTEXT_LABEL = "\n\nBatch context:\n";

const PEM_LABEL = "[ A-Z0-9_-]{0,100}PRIVATE KEY(?: BLOCK)?-----";
const AWS_ID = "(?:A3T[A-Z0-9]|AKIA|ASIA|ABIA|ACCA)[A-Z0-9]{16}(?![A-Za-z0-9])";

// The task text goes to a third party, and nothing marks which strings are secrets, so redaction matches shapes.
// A rule that can fail after a long scan starts where the token's own alphabet does not precede it, and every gap is bounded, so each rule runs in linear time.
// Order matters: the PEM, URL, header and AWS rules keep context that the later prefix and name rules would otherwise consume.
const REDACT_PATTERNS: readonly [RegExp, string][] = [
	[
		new RegExp(
			`-----BEGIN${PEM_LABEL}(?:(?:[^-]|-(?!----))*-----END${PEM_LABEL}|(?:(?:\\s|\\\\[rn])+[A-Za-z0-9+/=]{16,})*)`,
			"gi",
		),
		"***",
	],
	[
		/(?<![a-z0-9+.-])([a-z][a-z0-9+.-]{0,30}:\/\/)[^\s:@/?#'"]{0,256}:[^\s@/?#'"]{1,256}@/gi,
		"$1***@",
	],
	[
		/\b(Authorization["']?\s*[:=]\s*["']?(?:[A-Za-z][\w-]*\s+)?)[A-Za-z0-9._~+/=-]{8,}/gi,
		"$1***",
	],
	[
		new RegExp(
			`((?<![A-Za-z0-9])${AWS_ID}[^\\n]{0,100}?)(?<![A-Za-z0-9+/])[A-Za-z0-9+/]{40}(?![A-Za-z0-9+/=])`,
			"g",
		),
		"$1***",
	],
	[
		/(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{8,}={0,2}\.ey[A-Za-z0-9_-]{8,}={0,2}\.[A-Za-z0-9_-]*/g,
		"***",
	],
	[
		new RegExp(
			`(?<![A-Za-z0-9])(?:${[
				"gh[pousr]_[A-Za-z0-9]{36,}",
				"github_pat_[A-Za-z0-9_]{22,}",
				"glpat-[A-Za-z0-9_-]{20,}",
				"xox[abeoprs]-[A-Za-z0-9-]{10,}",
				"xapp-\\d-[A-Za-z0-9-]{10,}",
				"hooks\\.slack\\.com/(?:services|workflows|triggers)/[A-Za-z0-9+/]{20,}",
				AWS_ID,
				"AIza[A-Za-z0-9_-]{35}",
				"[rs]k_(?:live|test|prod)_[A-Za-z0-9]{10,}",
				"npm_[A-Za-z0-9]{36}",
				"hf_[A-Za-z]{34}",
				"pypi-AgEIcHlwaS5vcmc[A-Za-z0-9_-]{50,}",
			].join("|")})`,
			"g",
		),
		"***",
	],
	[/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer ***"],
	[/\bsk-[A-Za-z0-9_-]{8,}/g, "***"],
	[
		/((?<!\S)(?:-u|--user)(?:\s+|=))(?:"[^"\n]*:[^"\n]*"|'[^'\n]*:[^'\n]*'|[^\s"':]+:[^\s"']+)/g,
		"$1***",
	],
	[
		/\b(pass(?:word|phrase)|passwd)(\s+(?:is|was)\s+)(?:"[^"]*"?|'[^']*'?|[^\s"']+)/gi,
		"$1$2***",
	],
	[
		/\b([A-Za-z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD))(["']?\s*[=:]\s*)(?:"[^"]*"?|'[^']*'?|[^\s"']+)/gi,
		"$1$2***",
	],
];

// A backtick info string holds no backtick (CommonMark 0.31.2, 4.5), and a fence starts only where no fence character precedes it.
// Each closer is a literal run, not a backreference, so an unclosed opener scans the text at most once per fence character.
const FENCE =
	/(?<![`~])(?:```+[^\n`]*\n([\s\S]*?)```|~~~+[^\n~]*\n([\s\S]*?)~~~)/g;

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
		.replace(
			FENCE,
			(_, tick: string | undefined, tilde: string | undefined) => {
				const lines = (tick ?? tilde ?? "")
					.replace(/\n$/, "")
					.split("\n").length;
				return `[an exact block of ${lines} ${lines === 1 ? "line" : "lines"} is given verbatim]`;
			},
		)
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

/**
 * Returns the context unchanged when it is text with a non-blank character, and
 * an empty string for anything else. Never throws.
 */
export function contextText(context: unknown): string {
	return typeof context === "string" && nonEmpty(context) !== undefined
		? context
		: "";
}

/**
 * Returns a description as one masked line of at most ROLE_CAP characters, and
 * an empty string for anything that is not text with a non-blank character.
 * Redaction runs before the cut, and the cut drops a lone high surrogate so no
 * half of a pair is sent. Never throws.
 */
export function descriptionText(description: unknown): string {
	if (typeof description !== "string") return "";
	const text = redact(description).replace(/\s+/g, " ").trim();
	const cut = text.slice(0, ROLE_CAP);
	return /[\uD800-\uDBFF]$/.test(cut) && text.length > ROLE_CAP
		? cut.slice(0, -1)
		: cut;
}

export function roleText(description: unknown): string {
	return descriptionText(description) || NO_DESCRIPTION;
}
