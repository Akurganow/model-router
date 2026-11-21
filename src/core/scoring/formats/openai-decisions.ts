import { LEVELS, type Probabilities } from "#core/parts/part.ts";
import { isRecord } from "#utils/guards.ts";
import type { Format } from "./format.ts";
import {
	levelProbabilities,
	replyReader,
	stateText,
	usageNamed,
} from "./shared.ts";

// The answers as a list: the one item with the part's name holds its probabilities.
// The value, not the position or the label, says which level a probability belongs to.
function listAnswer(answers: unknown, key: string): Probabilities | undefined {
	if (!Array.isArray(answers)) return undefined;
	const [item, ...others] = answers
		.filter(isRecord)
		.filter(({ name }) => name === key);
	if (!item || others.length > 0) return undefined;
	const { type, probabilities } = item;
	if (type !== "score" || !Array.isArray(probabilities)) return undefined;
	// Three entries that hold 0, 1 and 2 leave no repeated and no fourth level.
	if (probabilities.length !== LEVELS.length) return undefined;
	const byValue = new Map<unknown, unknown>();
	for (const entry of probabilities) {
		if (!isRecord(entry)) return undefined;
		const { value, probability } = entry;
		byValue.set(value, probability);
	}
	return levelProbabilities(byValue.get(0), byValue.get(1), byValue.get(2));
}

export const OPENAI_DECISIONS: Format = {
	body: (parts, state, model) =>
		JSON.stringify({
			model,
			input: stateText(state),
			questions: parts.map(({ key, question }) => ({
				type: "score",
				name: key,
				instructions: question.instructions,
				levels: question.criteria.map((description, index) => ({
					label: String(index),
					description,
				})),
			})),
		}),
	read: replyReader(listAnswer, usageNamed("input_tokens", "output_tokens")),
};
