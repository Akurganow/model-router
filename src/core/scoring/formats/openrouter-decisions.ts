import type { Format } from "./format.ts";
import {
	mapAnswer,
	questionMap,
	replyReader,
	stateText,
	usageNamed,
} from "./shared.ts";

// The gateway takes the same text the maker's own API takes, so the state goes as text.
export const OPENROUTER_DECISIONS: Format = {
	body: (parts, state, model) =>
		JSON.stringify({
			state: stateText(state),
			model,
			questions: questionMap(parts),
		}),
	read: replyReader(mapAnswer, usageNamed("input_tokens", "output_tokens")),
};
