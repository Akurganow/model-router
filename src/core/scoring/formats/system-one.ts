import type { Format } from "./format.ts";
import { questionMap, readScoreMap, usageNamed } from "./shared.ts";

const usageOf = usageNamed("input_tokens", "output_tokens");

// The body of POST /v1/systemone: the state, the model and one score question for each part.
export const SYSTEM_ONE: Format = {
	body: (parts, state, model) =>
		JSON.stringify({ state, model, questions: questionMap(parts) }),
	read: (parts, text) => readScoreMap(parts, text, usageOf),
};
