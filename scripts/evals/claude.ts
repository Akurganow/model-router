import { get, isRecord, jsonLines } from "./stream.ts";
import type { Adapter, Evidence, Tier } from "./types.ts";

const SPAWN_TOOL = "Agent";
// `$.ui.log` reaches a stream-json host as a system event of this subtype.
const LOG_SUBTYPE = "ui_log";
// The mod writes "L<tier> <model> · <effort> · p=<tier>/<work>"; the host may prefix its name.
const DECISION_LINE =
	/^(?:model-router )?L([012]) (\S+) · (caller effort|[^\s·]+) · p=\d+(?:\.\d+)?\/\d+(?:\.\d+)?/;

const emptyEvidence = (): Evidence => ({
	spawns: 0,
	routed: false,
	line: null,
	tier: null,
	effort: null,
	target: null,
});

function countSpawns(event: Record<string, unknown>): number {
	const message = get(event, "message");
	if (get(event, "type") !== "assistant" || !isRecord(message)) return 0;
	const content = get(message, "content");
	if (!Array.isArray(content)) return 0;
	return content.filter(
		(b) =>
			isRecord(b) &&
			get(b, "type") === "tool_use" &&
			get(b, "name") === SPAWN_TOOL,
	).length;
}

export const claude: Adapter = {
	name: "claude",
	command: (prompt, model) => [
		"claude",
		"-p",
		prompt,
		"--model",
		model,
		"--output-format",
		"stream-json",
		"--verbose",
		"--allowedTools",
		"Agent",
		"Read",
	],
	parse({ stdout }) {
		const evidence = emptyEvidence();
		for (const event of jsonLines(stdout)) {
			evidence.spawns += countSpawns(event);
			if (evidence.line !== null) continue;
			const text = get(event, "text");
			if (get(event, "subtype") !== LOG_SUBTYPE || typeof text !== "string")
				continue;
			const match = DECISION_LINE.exec(text);
			if (!match) continue;
			evidence.line = text;
			evidence.routed = true;
			evidence.tier = Number(match[1]) as Tier;
			evidence.target = match[2] ?? null;
			evidence.effort = match[3] ?? null;
		}
		return evidence;
	},
};
