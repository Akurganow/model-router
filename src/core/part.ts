import { isRecord } from "../utils/guards.ts";

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

// The middle is the default. An end wins only when it is more than its factor times as likely as the middle. When both ends win, the likelier one does, and equal ends stay at the middle.
export const fromMiddle =
	(down: number, up: number) =>
	(p: Probabilities): Level => {
		const low = p[0] > down * p[1];
		const high = p[2] > up * p[1];
		if (low && high) return p[0] > p[2] ? 0 : p[2] > p[0] ? 2 : 1;
		return low ? 0 : high ? 2 : 1;
	};

const PROBABILITY_DIGITS = 2;

export const formatProbability = (p: number): string =>
	p.toFixed(PROBABILITY_DIGITS);

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
