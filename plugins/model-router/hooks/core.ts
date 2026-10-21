export const BUDGET_CHARS = 12000;
const TIE_MARGIN = 0.1;
const WORK_PRIOR = [0.5, 1, 0.5] as const;

export type Level = 0 | 1 | 2;
export type Probabilities = Record<`${Level}`, number>;

export const TIER_TEXTS = [
	"Lookup or transcription: the brief names the exact files to read or string to find, or holds the exact code, config or prose to write. It gives the commands to run and the check that proves the work done. No choice is left.",
	"Bounded judgment: the brief fixes the goal and a way to check the result. Check work against stated requirements, fix named defects, implement from a given plan or spec, or answer a question from a few named files.",
	"Open judgment: the brief leaves the approach open. Decide a design, create content with no plan or spec to follow, review a multi-file change for risks no checklist names, or debug with an unclear cause.",
] as const;

export const WORK_TEXTS = [
	"A short task: one or two mechanical steps in one place, nothing to diagnose, and the given command is the whole check.",
	"An ordinary task: reading or diagnosing code, a few steps or files, and a result to verify.",
	"A long or delicate task: many steps or files, hidden edge cases, or a wrong result that would look right.",
] as const;

const TIER_COUNT = TIER_TEXTS.length;
const TIER_INSTRUCTIONS =
	"How much judgment does completing `task` require from an agent whose role is `role`? `description` is the caller's one-line summary of the task.";
const WORK_INSTRUCTIONS =
	"How much work does completing `task` take for an agent whose role is `role`, once the judgment is settled? Count the steps, the files and the edge cases to verify.";

// The task text goes to a third party, and nothing marks which strings are secrets, so redaction matches shapes.
const REDACT_PATTERNS: readonly [RegExp, string][] = [
	[/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer ***"],
	[/\bsk-[A-Za-z0-9_-]{8,}/g, "***"],
	[
		/\b([A-Za-z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD))(["']?\s*[=:]\s*)(?:"[^"]*"?|'[^']*'?|[^\s"']+)/gi,
		"$1$2***",
	],
];

export type ScoreInput = {
	role: string;
	description: string;
	prompt: string;
	model: string;
};
export type Post = (body: string) => Promise<string>;
type Sleep = (ms: number) => Promise<void>;
export type ScoreOptions = { sleep?: Sleep };
export type Scored = {
	level: Level;
	workIndex: Level;
	probabilities: { tier: Probabilities; work: Probabilities };
};
export type Skipped = { skipped: string };

export async function score(
	input: ScoreInput,
	tierTexts: readonly [string, string, string],
	post: Post,
	options: ScoreOptions = {},
): Promise<Scored | Skipped> {
	if (tierTexts.length !== TIER_COUNT)
		throw new RangeError(`expected ${TIER_COUNT} tier texts`);
	const body = requestBody(input, tierTexts);
	let text: string;
	try {
		text = await sendWithRetry(post, body, options.sleep);
	} catch (err) {
		return { skipped: err instanceof Error ? err.message : String(err) };
	}
	let answers: unknown;
	try {
		answers = JSON.parse(text)?.answers;
	} catch {
		return { skipped: "malformed answer" };
	}
	const tier = parseScore(answers, "tier");
	const work = parseScore(answers, "work");
	if (!tier || !work) return { skipped: "malformed answer" };
	return {
		level: pickTier(tier),
		workIndex: pickWork(work),
		probabilities: { tier, work },
	};
}

export const DEADLINE_MS = 8000;
export const RETRY_DELAY_MS = 300;
const RETRY_STATUSES: readonly number[] = [408, 429];
const SERVER_ERROR_MIN = 500;
const SERVER_ERROR_MAX = 599;

export type TransportKind = "network" | "timeout" | "http";
type TransportDetail = { status?: number; message?: string };

export class TransportError extends Error {
	readonly kind: TransportKind;
	readonly status: number | undefined;

	constructor(kind: TransportKind, detail: TransportDetail = {}) {
		super(detail.message ?? describe(kind, detail.status));
		this.kind = kind;
		this.status = detail.status;
	}
}

function describe(kind: TransportKind, status: number | undefined): string {
	if (kind === "network") return "network error";
	if (kind === "timeout") return `no answer in ${DEADLINE_MS} ms`;
	return `HTTP ${status ?? "error"}`;
}

function retryable(err: unknown): boolean {
	if (!(err instanceof TransportError)) return false;
	if (err.kind === "network") return true;
	const { status } = err;
	if (err.kind !== "http" || status === undefined) return false;
	return (
		RETRY_STATUSES.includes(status) ||
		(status >= SERVER_ERROR_MIN && status <= SERVER_ERROR_MAX)
	);
}

// Without a wait the core cannot pause, so it does not retry.
async function sendWithRetry(
	post: Post,
	body: string,
	sleep: Sleep | undefined,
): Promise<string> {
	try {
		return await post(body);
	} catch (err) {
		if (!sleep || !retryable(err)) throw err;
		await sleep(RETRY_DELAY_MS);
		return post(body);
	}
}

function requestBody(input: ScoreInput, tierTexts: readonly string[]): string {
	const task = prepareBrief(input.prompt);
	return JSON.stringify({
		model: input.model,
		state: { role: input.role, description: input.description, task },
		questions: {
			tier: {
				type: "score",
				instructions: TIER_INSTRUCTIONS,
				criteria: tierTexts,
			},
			work: {
				type: "score",
				instructions: WORK_INSTRUCTIONS,
				criteria: WORK_TEXTS,
			},
		},
	});
}

export const OMISSION_MARKER = "\n[middle of the brief omitted]\n";
const HEAD_SHARE = 2 / 3;

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

const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === "object" && v !== null;

const MODEL_CHARS_MAX = 40;

// The suffix shows what judged the task. Fields the response lacks are left out, never guessed.
export function decisionSuffix(responseText: string): string {
	let reply: unknown;
	try {
		reply = JSON.parse(responseText);
	} catch {
		return "";
	}
	if (!isRecord(reply)) return "";
	const { model: rawModel, usage: rawUsage } = reply;
	const model =
		typeof rawModel === "string"
			? rawModel.replace(/[^A-Za-z0-9._-]/g, "").slice(0, MODEL_CHARS_MAX)
			: "";
	const usage = isRecord(rawUsage) ? rawUsage : {};
	const { input_tokens: input, output_tokens: output } = usage;
	return (
		(model ? ` · jev ${model}` : "") +
		(isCount(input) && isCount(output) ? ` · ${input}/${output} tok` : "")
	);
}

const isCount = (v: unknown): v is number =>
	typeof v === "number" && Number.isSafeInteger(v) && v >= 0;

function parseScore(answers: unknown, key: string): Probabilities | undefined {
	const a = isRecord(answers) ? answers[key] : undefined;
	if (!isRecord(a)) return undefined;
	const { type, probabilities } = a;
	if (type !== "score" || !isRecord(probabilities)) return undefined;
	if (Object.keys(probabilities).length !== TIER_COUNT) return undefined;
	const { 0: p0, 1: p1, 2: p2 } = probabilities;
	if (
		typeof p0 !== "number" ||
		typeof p1 !== "number" ||
		typeof p2 !== "number"
	)
		return undefined;
	return { 0: p0, 1: p1, 2: p2 };
}

// A near tie goes to the highest level within the margin: when unsure, the larger model.
function pickTier(p: Probabilities): Level {
	const best = ([0, 1, 2] as Level[]).reduce((a, b) => (p[b] > p[a] ? b : a));
	for (const i of [2, 1] as Level[])
		if (i > best && p[best] - p[i] < TIE_MARGIN) return i;
	return best;
}

// The middle is the resting point: an end wins only with more than twice its probability. Equal ends go to the heavier one.
function pickWork(p: Probabilities): Level {
	let best: Level = 1;
	for (const i of [2, 0] as Level[]) {
		if (p[i] * WORK_PRIOR[i] > p[best] * WORK_PRIOR[best]) best = i;
	}
	return best;
}
