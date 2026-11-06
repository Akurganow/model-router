import { FAILED, TIMEOUT } from "./compose.ts";
import { LINE_PREFIX, SKIPPED_PREFIX } from "./line.ts";
import {
	CONFIG_EFFORT,
	modelUnresolved,
	modelUnset,
	NO_END_MODEL,
	SUBAGENT_MODEL_SET,
} from "./reasons.ts";
import { KEY_UNSET } from "./settings.ts";

/**
 * Python ends a Node run this long after its budget, so Node's own deadline
 * settles first and the kill is for a stuck process only.
 */
export const GRACE_MS = 1000;

// Every text the Hermes shim prints or checks. The builder writes them to constants.json.
export const HERMES_TEXTS = {
	linePrefix: LINE_PREFIX,
	skippedPrefix: SKIPPED_PREFIX,
	graceMs: GRACE_MS,
	nodeNotFound: "node not found",
	keyUnset: KEY_UNSET,
	timeout: TIMEOUT,
	failed: FAILED,
	configEffort: CONFIG_EFFORT,
	subagentModelSet: SUBAGENT_MODEL_SET,
	noEndModel: NO_END_MODEL,
	smallModelUnset: modelUnset("small"),
	largeModelUnset: modelUnset("large"),
	smallModelUnresolved: modelUnresolved("small"),
	largeModelUnresolved: modelUnresolved("large"),
} as const;
