import { isRecord } from "../../../utils/guards.ts";
import { LEVELS, type Part, type Probabilities } from "../../parts/part.ts";
import { type Failure, isSuccess, MALFORMED } from "../failure.ts";
import type { Usage } from "../reply.ts";
import type { Answers, Format } from "./format.ts";

// NaN fails both comparisons, so the range alone also rejects it.
const isProbability = (p: unknown): p is number =>
	typeof p === "number" && p >= 0 && p <= 1;

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

function parse(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}

const count = (v: unknown): number | null => (typeof v === "number" ? v : null);

function usageOf(usage: unknown): Usage | undefined {
	if (!isRecord(usage)) return undefined;
	const { input_tokens, output_tokens } = usage;
	return {
		input_tokens: count(input_tokens),
		output_tokens: count(output_tokens),
	};
}

function read(
	parts: readonly Part[],
	status: number,
	text: string,
): Answers | Failure {
	if (!isSuccess(status)) return { failure: "status", status };
	const reply = parse(text);
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

// The body of POST /v1/systemone: the state, the model and one score question for each part.
export const SYSTEM_ONE: Format = {
	body: (parts, state, model) =>
		JSON.stringify({
			state,
			model,
			questions: Object.fromEntries(parts.map((p) => [p.key, p.question])),
		}),
	read,
};
