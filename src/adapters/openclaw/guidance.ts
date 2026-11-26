import { BRIEF_GUIDANCE } from "#core/brief/guidance.ts";
import type { PromptBuildHandler } from "./types.ts";

export const PROMPT_HOOK = "before_prompt_build";

// A spawned child's session key reads agent:<id>:subagent:<uuid>.
const SUBAGENT_KEY = /(^|:)subagent:/;

/**
 * Appends the brief text to the system context of a main session and leaves a
 * spawned child alone. A session with no key gets the text. It reads nothing from the
 * event, which carries the conversation.
 */
export const briefGuidance: PromptBuildHandler = async (_, ctx) =>
	SUBAGENT_KEY.test(ctx?.sessionKey ?? "")
		? undefined
		: { appendSystemContext: BRIEF_GUIDANCE };
