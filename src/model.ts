export type Level = 0 | 1 | 2;
export type Probabilities = Record<`${Level}`, number>;
export type Part = {
	readonly key: string;
	readonly question: {
		readonly type: "score";
		readonly instructions: string;
		readonly criteria: readonly [string, string, string];
	};
	readonly pick: (probabilities: Probabilities) => Level;
};

const PROBABILITY_DIGITS = 2;

export const formatProbability = (p: number): string =>
	p.toFixed(PROBABILITY_DIGITS);

const LEVELS: readonly Level[] = [0, 1, 2];
const TIE_MARGIN = 0.1;

const TIER_INSTRUCTIONS =
	"How much judgment does completing `task` require from an agent whose role is `role`? `description` is the caller's one-line summary of the task.";

export const TIER_TEXTS = [
	"Lookup or transcription: the brief names the exact files to read or string to find, or holds the exact code, config or prose to write. It gives the commands to run and the check that proves the work done. No choice is left.",
	"Bounded judgment: the brief fixes the goal and a way to check the result. Check work against stated requirements, fix named defects, implement from a given plan or spec, or answer a question from a few named files.",
	"Open judgment: the brief leaves the approach open. Decide a design, create content with no plan or spec to follow, review a multi-file change for risks no checklist names, or debug with an unclear cause.",
] as const;

export const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === "object" && v !== null;

// Validation lives here, with the types it produces, so every part reads answers the same way.
export function parseProbabilities(
	answers: unknown,
	key: string,
): Probabilities | undefined {
	const a = isRecord(answers) ? answers[key] : undefined;
	if (!isRecord(a)) return undefined;
	const { type, probabilities } = a;
	if (type !== "score" || !isRecord(probabilities)) return undefined;
	if (Object.keys(probabilities).length !== LEVELS.length) return undefined;
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
	const best = LEVELS.reduce((a, b) => (p[b] > p[a] ? b : a));
	for (const i of [2, 1] as Level[])
		if (i > best && p[best] - p[i] < TIE_MARGIN) return i;
	return best;
}

export const tier: Part = {
	key: "tier",
	question: {
		type: "score",
		instructions: TIER_INSTRUCTIONS,
		criteria: TIER_TEXTS,
	},
	pick: pickTier,
};
