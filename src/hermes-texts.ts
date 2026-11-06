import { FAILED, TIMEOUT } from "./compose.ts";
import { NO_END_MODEL, NODE_NOT_FOUND, SUBAGENT_MODEL_SET } from "./reasons.ts";
import { KEY_UNSET } from "./settings.ts";

/**
 * Python ends a Node run this long after its budget, so Node's own deadline
 * settles first and the kill is for a stuck process only.
 */
export const GRACE_MS = 1000;

// What the Hermes shim reads from constants.json. The builder turns each reason
// into a finished skip line, so Python never builds the line format.
export const HERMES_TEXTS = {
	graceMs: GRACE_MS,
	// The reasons Python gives for a task before Node runs, or when Node cannot answer.
	reasons: {
		keyUnset: KEY_UNSET,
		noEndModel: NO_END_MODEL,
		subagentModelSet: SUBAGENT_MODEL_SET,
		nodeNotFound: NODE_NOT_FOUND,
		timeout: TIMEOUT,
		failed: FAILED,
	},
} as const;
