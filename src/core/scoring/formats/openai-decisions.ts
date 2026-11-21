import { LEVELS, type Part, type Probabilities } from "#core/parts/part.ts";
import { type Failure, MALFORMED } from "#core/scoring/failure.ts";
import { isRecord } from "#utils/guards.ts";
import type { Answers, Format } from "./format.ts";
import { isProbability, parseJson, stateText, usageNamed } from "./shared.ts";

const usageOf = usageNamed("input_tokens", "output_tokens");

// The value, not the position or the label, says which level a probability belongs to.
function probabilitiesOf(
	answers: readonly unknown[],
	key: string,
): Probabilities | undefined {
	const [item, ...others] = answers
		.filter(isRecord)
		.filter(({ name }) => name === key);
	if (!item || others.length > 0) return undefined;
	const { type, probabilities } = item;
	if (type !== "score" || !Array.isArray(probabilities)) return undefined;
	if (probabilities.length !== LEVELS.length) return undefined;
	const byValue = new Map<unknown, unknown>();
	for (const entry of probabilities) {
		if (!isRecord(entry)) return undefined;
		const { value, probability } = entry;
		byValue.set(value, probability);
	}
	const p0 = byValue.get(0);
	const p1 = byValue.get(1);
	const p2 = byValue.get(2);
	if (!isProbability(p0) || !isProbability(p1) || !isProbability(p2))
		return undefined;
	return { 0: p0, 1: p1, 2: p2 };
}

function read(parts: readonly Part[], text: string): Answers | Failure {
	const reply = parseJson(text);
	const { answers, model, usage }: Record<string, unknown> = isRecord(reply)
		? reply
		: {};
	if (!Array.isArray(answers)) return MALFORMED;
	const pairs: (readonly [Part, Probabilities])[] = [];
	for (const part of parts) {
		const probabilities = probabilitiesOf(answers, part.key);
		if (!probabilities) return MALFORMED;
		pairs.push([part, probabilities]);
	}
	return { answers: pairs, model, usage: usageOf(usage) };
}

export const OPENAI_DECISIONS: Format = {
	body: (parts, state, model) =>
		JSON.stringify({
			model,
			input: stateText(state),
			questions: parts.map(({ key, question }) => ({
				type: question.type,
				name: key,
				instructions: question.instructions,
				levels: question.criteria.map((description, index) => ({
					label: String(index),
					description,
				})),
			})),
		}),
	read,
};
