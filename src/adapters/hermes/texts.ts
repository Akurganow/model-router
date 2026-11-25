import { EFFORTS } from "#core/decision/ladder.ts";
import type { Stored } from "#core/options/settings.ts";
import {
	FAILED,
	KEY_UNSET,
	SUBAGENT_MODEL_SET,
	TIMEOUT,
} from "#core/output/reasons.ts";
import { LEVELS } from "#core/parts/part.ts";

// The stored setting that names the scoring model of each provider. Python reads it and sends it as stored.
export const MODELS_SETTING = "models" satisfies keyof Stored;

// What Python asks Node for to print the `models` lines, which only the bundle can read.
export const MODELS_COMMAND = "modelsLines";

// The line Python prints when it cannot get the models lines from Node.
export const MODELS_UNAVAILABLE = "models: unavailable, no answer from node";

// The reason Python gives when no Node runtime is on the path.
const NODE_NOT_FOUND = "node not found";

/**
 * Python ends a Node run this long after its budget, so Node's own deadline
 * settles first and the kill is for a stuck process only.
 */
const GRACE_MS = 1000;

// What the Hermes shim reads from constants.json. The builder turns each reason
// into a finished skip line, so Python never builds the line format.
export const HERMES_TEXTS = {
	graceMs: GRACE_MS,
	// The reasons Python gives for a task before Node runs, or when Node cannot answer.
	reasons: {
		keyUnset: KEY_UNSET,
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
					"One line that says what this task is. model-router sends it with the goal to the scoring model, which judges the model and effort the child needs.",
			},
			reasoning_effort: {
				type: "string",
				enum: [...EFFORTS],
				description: `${ONLY_TO_ESCALATE} The child runs at this effort, and model-router still picks its model. A delegation.reasoning_effort in the user's config wins.`,
			},
			level: {
				type: "integer",
				enum: [...LEVELS],
				description: `${ONLY_TO_ESCALATE} 0 runs the child on the user's small model, 1 on the user's middle model, 2 on the large model, and model-router asks the scoring model nothing. A level whose model is not set runs on the model Hermes gives it. A routed task's label shows its level as L0, L1 or L2. A model in the user's delegation config wins.`,
			},
		},
		delegationAddendum: `model-router picks each task's model and effort. Give every task a description. Leave reasoning_effort and level unset unless you re-dispatch a failed task; the ${pluginName}:${ESCALATION_SKILL} skill says how.`,
	};
}
