// The text each plugin gives the main agent on how to write a subagent brief.
// docs/providers.md#the-brief-text shows it: change both together.
export const BRIEF_GUIDANCE =
	"When model-router routes a subagent, it picks the model from this brief. State what is already decided and what you leave open for the subagent. Name the files and the check that proves the work done. Give the size: steps, files and edge cases.";
