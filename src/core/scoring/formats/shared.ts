import type { RoutingState } from "#core/brief/brief.ts";
import { LEVELS, type Part, type Probabilities } from "#core/parts/part.ts";
import { MALFORMED } from "#core/scoring/failure.ts";
import type { Usage } from "#core/scoring/reply.ts";
import { isRecord } from "#utils/guards.ts";
import type { Format } from "./format.ts";

// The Decisions APIs take the state as text where System One takes an object.
export const stateText = (state: RoutingState): string => JSON.stringify(state);

export const questionMap = (parts: readonly Part[]) =>
	Object.fromEntries(parts.map((p) => [p.key, p.question]));

const count = (v: unknown): number | null => (typeof v === "number" ? v : null);

export const usageNamed =
	(input: string, output: string) =>
	(usage: unknown): Usage | undefined => {
		if (!isRecord(usage)) return undefined;
		return {
			input_tokens: count(usage[input]),
			output_tokens: count(usage[output]),
		};
	};

// NaN fails both comparisons, so the range alone also rejects it.
const isProbability = (p: unknown): p is number =>
	typeof p === "number" && p >= 0 && p <= 1;

// One probability for each level. A value that is none fails all three.
export function levelProbabilities(
	p0: unknown,
	p1: unknown,
	p2: unknown,
): Probabilities | undefined {
	if (!isProbability(p0) || !isProbability(p1) || !isProbability(p2))
		return undefined;
	return { 0: p0, 1: p1, 2: p2 };
}

type PartReader = (answers: unknown, key: string) => Probabilities | undefined;

// The answers as a map by part key: each has `type: "score"` and three probabilities by level.
export const mapAnswer: PartReader = (answers, key) => {
	const a = isRecord(answers) ? answers[key] : undefined;
	if (!isRecord(a)) return undefined;
	const { type, probabilities } = a;
	if (type !== "score" || !isRecord(probabilities)) return undefined;
	if (Object.keys(probabilities).length !== LEVELS.length) return undefined;
	const { 0: p0, 1: p1, 2: p2 } = probabilities;
	return levelProbabilities(p0, p1, p2);
};

function parseJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}

// The one reading of a reply. A format gives the reader of one part and the names of its counts.
export const replyReader =
	(
		probabilitiesOf: PartReader,
		usageOf: (usage: unknown) => Usage | undefined,
	): Format["read"] =>
	(parts, text) => {
		const reply = parseJson(text);
		const { answers, model, usage }: Record<string, unknown> = isRecord(reply)
			? reply
			: {};
		const pairs: (readonly [Part, Probabilities])[] = [];
		for (const part of parts) {
			const probabilities = probabilitiesOf(answers, part.key);
			if (!probabilities) return MALFORMED;
			pairs.push([part, probabilities]);
		}
		return { answers: pairs, model, usage: usageOf(usage) };
	};
