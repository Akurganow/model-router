import { BRIEF_GUIDANCE } from "#core/brief/guidance.ts";
import type { PromptBuildHandler } from "./types.ts";

export const PROMPT_HOOK = "before_prompt_build";

// OpenClaw's isSubagentSessionKey and isAcpSessionKey in
// src/sessions/session-key-utils.ts lower-case the key and test its start, or the
// start of the part after agent:<id>:. Neither a subagent nor an ACP session gets
// the text.
const CHILD_KEY = /^(?:agent:[^:]*:)?(?:subagent|acp):/i;

/**
 * Appends the brief text to the system context of a main session. A spawned
 * subagent or an ACP session gets nothing. A session with no key gets the text.
 * It reads nothing from the event, which carries the conversation.
 */
export const briefGuidance: PromptBuildHandler = async (_, ctx) =>
	CHILD_KEY.test(ctx?.sessionKey ?? "")
		? undefined
		: { appendSystemContext: BRIEF_GUIDANCE };
