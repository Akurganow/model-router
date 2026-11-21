import type { Format } from "./format.ts";
import { questionMap, readScoreMap, stateText, usageNamed } from "./shared.ts";

const usageOf = usageNamed("total_input_tokens", "total_output_tokens");

// The reply names no model.
export const GEMINI_DECISIONS: Format = {
	body: (parts, state, model) =>
		JSON.stringify({
			model,
			input: stateText(state),
			questions: questionMap(parts),
		}),
	read: (parts, text) => readScoreMap(parts, text, usageOf),
};
