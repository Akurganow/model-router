// The text each plugin gives the main agent on how to write a subagent brief.
// docs/providers.md#the-brief-text shows it: change both together.
export const BRIEF_GUIDANCE =
	"When model-router routes a subagent, it picks the model from this brief. Say what is already decided. If nothing is left to decide, say that nothing is; otherwise name what you leave to the subagent.";
