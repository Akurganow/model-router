import type { Format } from "./format.ts";
import {
	mapAnswer,
	questionMap,
	replyReader,
	stateText,
	usageNamed,
} from "./shared.ts";

export const GEMINI_DECISIONS: Format = {
	body: (parts, state, model) =>
		JSON.stringify({
			model,
			input: stateText(state),
			questions: questionMap(parts),
		}),
	read: replyReader(
		mapAnswer,
		usageNamed("total_input_tokens", "total_output_tokens"),
	),
};
