import { FAILED, TIMEOUT } from "../../core/compose.ts";
import { EFFORTS } from "../../core/ladder.ts";
import { LEVELS } from "../../core/part.ts";
import {
	NO_END_MODEL,
	NODE_NOT_FOUND,
	SUBAGENT_MODEL_SET,
} from "../../core/reasons.ts";
import { KEY_UNSET } from "../../core/settings.ts";

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

// The folder of the escalation skill under the plugin's skills/; Hermes names it <plugin>:<folder>.
export const ESCALATION_SKILL = "model-router";

const ONLY_TO_ESCALATE = "Leave it unset unless you re-dispatch a failed task.";

/**
 * The per-task parameters the Hermes backend declares on delegate_task, as JSON
 * schemas, and the line Hermes appends to the tool description. Both go into the
 * cached prompt prefix, so they are fixed text with no input but the plugin name.
 */
export function taskParameterTexts(pluginName: string) {
	return {
		taskParameters: {
			description: {
				type: "string",
				description:
					"One line that says what this task is. model-router sends it with the goal to Jev, which judges the model and effort the child needs.",
			},
			reasoning_effort: {
				type: "string",
				enum: [...EFFORTS],
				description: `${ONLY_TO_ESCALATE} The child runs at this effort, and model-router still picks its model. A delegation.reasoning_effort in the user's config wins.`,
			},
			level: {
				type: "integer",
				enum: [...LEVELS],
				description: `${ONLY_TO_ESCALATE} 0 runs the child on the user's small model, 1 on the model Hermes gives it, 2 on the large model, and model-router asks Jev nothing. A routed task's label shows its level as L0, L1 or L2. A model in the user's delegation config wins.`,
			},
		},
		delegationAddendum: `model-router picks each task's model and effort. Give every task a description. Leave reasoning_effort and level unset unless you re-dispatch a failed task; the ${pluginName}:${ESCALATION_SKILL} skill says how.`,
	};
}
