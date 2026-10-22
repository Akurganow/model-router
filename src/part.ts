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

export const LEVELS: readonly Level[] = [0, 1, 2];

const PROBABILITY_DIGITS = 2;

export const formatProbability = (p: number): string =>
	p.toFixed(PROBABILITY_DIGITS);

export const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === "object" && v !== null;

// Every part reads its answer through this one check.
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
