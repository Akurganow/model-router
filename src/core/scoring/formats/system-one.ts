import type { Format } from "./format.ts";
import { mapAnswer, questionMap, replyReader, usageNamed } from "./shared.ts";

// The body of POST /v1/systemone: the state, the model and one score question for each part.
export const SYSTEM_ONE: Format = {
	body: (parts, state, model) =>
		JSON.stringify({ state, model, questions: questionMap(parts) }),
	read: replyReader(mapAnswer, usageNamed("input_tokens", "output_tokens")),
};
