import type { RoutingState } from "#core/brief/brief.ts";
import { LEVELS, type Part, type Probabilities } from "#core/parts/part.ts";
import { type Failure, MALFORMED } from "#core/scoring/failure.ts";
import type { Usage } from "#core/scoring/reply.ts";
import { isRecord } from "#utils/guards.ts";
import type { Answers } from "./format.ts";

// NaN fails both comparisons, so the range alone also rejects it.
export const isProbability = (p: unknown): p is number =>
	typeof p === "number" && p >= 0 && p <= 1;

export function parseJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}

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

// Every part reads its answer through this one check.
function parseProbabilities(
	answers: unknown,
	key: string,
): Probabilities | undefined {
	const a = isRecord(answers) ? answers[key] : undefined;
	if (!isRecord(a)) return undefined;
	const { type, probabilities } = a;
	if (type !== "score" || !isRecord(probabilities)) return undefined;
	if (Object.keys(probabilities).length !== LEVELS.length) return undefined;
	const { 0: p0, 1: p1, 2: p2 } = probabilities;
	if (!isProbability(p0) || !isProbability(p1) || !isProbability(p2))
		return undefined;
	return { 0: p0, 1: p1, 2: p2 };
}

export function readScoreMap(
	parts: readonly Part[],
	text: string,
	usageOf: (usage: unknown) => Usage | undefined,
): Answers | Failure {
	const reply = parseJson(text);
	const { answers, model, usage }: Record<string, unknown> = isRecord(reply)
		? reply
		: {};
	const pairs: (readonly [Part, Probabilities])[] = [];
	for (const part of parts) {
		const probabilities = parseProbabilities(answers, part.key);
		if (!probabilities) return MALFORMED;
		pairs.push([part, probabilities]);
	}
	return { answers: pairs, model, usage: usageOf(usage) };
}
