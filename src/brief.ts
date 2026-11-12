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

export type Redaction = {
	readonly name: string;
	readonly pattern: RegExp;
	readonly replacement: string;
};

// HTTP authentication schemes, after which the rest of the header line is the credential.
const AUTH_SCHEMES = [
	"AWS4-HMAC-SHA256",
	"ApiKey",
	"Basic",
	"Bearer",
	"Concealed",
	"Digest",
	"DPoP",
	"GNAP",
	"HOBA",
	"Mutual",
	"Negotiate",
	"NTLM",
	"OAuth",
	"PrivateToken",
	"SCRAM-SHA-1",
	"SCRAM-SHA-256",
	"Token",
	"vapid",
].join("|");

// Each prefix ends in the whole run of its token's alphabet, so a longer token is masked whole.
export const TOKEN_PREFIXES: Readonly<Record<string, string>> = {
	"GitHub token": "gh[pousr]_[A-Za-z0-9]{36,}",
	"GitHub fine-grained token": "github_pat_[A-Za-z0-9_]{22,}",
	"GitLab token": "glpat-[A-Za-z0-9_-]{20,}",
	"Slack token": "xox[abeoprs]-[A-Za-z0-9-]{10,}",
	"Slack app token": "xapp-\\d-[A-Za-z0-9-]{10,}",
	"Slack webhook":
		"hooks\\.slack\\.com/(?:services|workflows|triggers)/[A-Za-z0-9+/]{20,}",
	"AWS access key id": AWS_ID,
	"Google API key": "AIza[A-Za-z0-9_-]{35,}",
	"Stripe key": "[rs]k_(?:live|test|prod)_[A-Za-z0-9]{10,}",
	"npm token": "npm_[A-Za-z0-9]{36,}",
	"Hugging Face token": "hf_[A-Za-z]{34,}",
	"PyPI token": "pypi-AgEIcHlwaS5vcmc[A-Za-z0-9_-]{50,}",
};

// The task text goes to a third party, and nothing marks which strings are secrets, so redaction matches shapes.
// docs/providers.md#the-task-text lists these shapes: change it with this table.
// A rule that can fail after a long scan starts where the token's own alphabet does not precede it. Every gap is bounded or ends at a delimiter its own class excludes, so each rule runs in linear time.
// Three orders keep a secret from leaking, and a test pins each. The AWS secret rule runs before the token prefixes, which would mask the id it needs.
// The PEM rule runs before the name rule, which would eat the header after "key:" and leave the body. The Bearer rule runs before the password and name rules, which would mask the word Bearer and leave the token.
export const REDACTIONS: readonly Redaction[] = [
	{
		name: "PEM private key",
		pattern: new RegExp(
			`-----BEGIN${PEM_LABEL}(?:(?:[^-]|-(?!----))*-----END${PEM_LABEL}|(?:(?:\\s|\\\\[rn])+[A-Za-z0-9+/=]{16,})*)`,
			"gi",
		),
		replacement: "***",
	},
	{
		name: "URL credentials",
		pattern:
			/(?<![a-z0-9+.-])([a-z][a-z0-9+.-]{0,30}:\/\/)[^\s:@/?#'"]{0,256}:[^\s/?#'"]{1,256}@/gi,
		replacement: "$1***@",
	},
	{
		name: "Authorization header",
		pattern: new RegExp(
			`\\b(Authorization["']?\\s*[:=]\\s*["']?)(?:((?:${AUTH_SCHEMES})[ \\t]+)\\S[^\\n]*|[A-Za-z0-9._~+/=-]{16,})`,
			"gi",
		),
		replacement: "$1$2***",
	},
	{
		name: "AWS secret",
		pattern: new RegExp(
			`((?<![A-Za-z0-9])${AWS_ID}[^\\n]{0,100}?)(?<![A-Za-z0-9+/])[A-Za-z0-9+/]{40}(?![A-Za-z0-9+/=])`,
			"g",
		),
		replacement: "$1***",
	},
	{
		name: "JSON Web Token",
		pattern:
			/(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{8,}={0,2}\.ey[A-Za-z0-9_-]{8,}={0,2}\.[A-Za-z0-9_-]*/g,
		replacement: "***",
	},
	{
		name: "token prefixes",
		pattern: new RegExp(
			`(?<![A-Za-z0-9])(?:${Object.values(TOKEN_PREFIXES).join("|")})`,
			"g",
		),
		replacement: "***",
	},
	{
		name: "Bearer token",
		pattern: /Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
		replacement: "Bearer ***",
	},
	{ name: "sk- key", pattern: /\bsk-[A-Za-z0-9_-]{8,}/g, replacement: "***" },
	{
		name: "curl user",
		pattern:
			/((?<!\S)(?:-[A-Za-z]{0,8}u|--(?:proxy-)?user)(?:\s+|=)?)(?:"[^"\n:]*:[^"\n]*"|'[^'\n:]*:[^'\n]*'|[^\s"':]+:[^\s"']+)/g,
		replacement: "$1***",
	},
	{
		name: "password is",
		pattern:
			/\b(pass(?:word|phrase)|passwd)(\s+(?:is|was)(?::\s*|\s+))(?:"[^"]*"?|'[^']*'?|[^\s"']+)/gi,
		replacement: "$1$2***",
	},
	{
		name: "secret name",
		pattern:
			/\b([A-Za-z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD))(["']?\s*[=:]\s*)(?:"[^"]*"?|'[^']*'?|[^\s"']+)/gi,
		replacement: "$1$2***",
	},
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
				const block = tick ?? tilde ?? "";
				const lines =
					block === "" ? 0 : block.replace(/\n$/, "").split("\n").length;
				return `[an exact block of ${lines} ${lines === 1 ? "line" : "lines"} is given verbatim]`;
			},
		)
		.replace(/\n{3,}/g, "\n\n");
}

function redact(text: string): string {
	return REDACTIONS.reduce(
		(t, { pattern, replacement }) => t.replace(pattern, replacement),
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

declare const masked: unique symbol;
/**
 * The state Jev reads. Only routingState builds one, so no caller can send a
 * field it forgot to mask.
 */
export type RoutingState = {
	readonly role: string;
	readonly description: string;
	readonly task: string;
	readonly [masked]: true;
};

/**
 * Builds the routing state from raw text: the role through roleText, the
 * description through descriptionText and the task with its context through
 * buildPrompt. A fixed role comes back as it is. Never throws.
 */
export function routingState(raw: {
	readonly role: unknown;
	readonly description: unknown;
	readonly task: string;
	readonly context?: string;
}): RoutingState {
	return {
		role: roleText(raw.role),
		description: descriptionText(raw.description),
		task: buildPrompt(raw.task, raw.context ?? ""),
	} as RoutingState;
}
