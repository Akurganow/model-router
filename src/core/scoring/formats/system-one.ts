import { isRecord } from "../../../utils/guards.ts";
import { LEVELS, type Part, type Probabilities } from "../../part.ts";
import { BAD_REPLY } from "../../reasons.ts";
import type { Failure } from "../failure.ts";
import type { Answers, Format } from "./format.ts";

const OK = { min: 200, max: 299 };

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

function read(
	parts: readonly Part[],
	status: number,
	text: string,
): Answers | Failure {
	if (status < OK.min || status > OK.max) return { failure: "status", status };
	const reply = parse(text);
	const { answers, model, usage }: Record<string, unknown> = isRecord(reply)
		? reply
		: {};
	const pairs: (readonly [Part, Probabilities])[] = [];
	for (const part of parts) {
		const probabilities = parseProbabilities(answers, part.key);
		if (!probabilities) return { failure: BAD_REPLY };
		pairs.push([part, probabilities]);
	}
	return { answers: pairs, model, usage };
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
