import type { Format } from "./format.ts";
import { questionMap, stateText } from "./shared.ts";
import { SYSTEM_ONE } from "./system-one.ts";

// The System One body with the state as text.
export const OPENROUTER_DECISIONS: Format = {
	body: (parts, state, model) =>
		JSON.stringify({
			state: stateText(state),
			model,
			questions: questionMap(parts),
		}),
	read: SYSTEM_ONE.read,
};
