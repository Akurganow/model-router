import type { Level } from "../../src/part.ts";
import { get, isRecord, jsonLines } from "./stream.ts";
import type { Adapter, Evidence } from "./types.ts";

const SPAWN_TOOL = "Agent";
// `$.ui.log` reaches a stream-json host as a system event of this subtype.
const LOG_SUBTYPE = "ui_log";
// The mod writes "L<tier> <model> · <effort> · p=<tier>/<work>"; the host may prefix its name.
const DECISION_LINE =
	/^(?:model-router )?L(?<tier>[012]) (?<target>\S+) · (?<effort>caller effort|[^\s·]+) · p=\d+(?:\.\d+)?\/\d+(?:\.\d+)?/;

const emptyEvidence = (): Evidence => ({
	spawns: 0,
	routed: false,
	line: null,
	tier: null,
	effort: null,
	target: null,
	reply: null,
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
			const result = get(event, "result");
			if (get(event, "type") === "result" && typeof result === "string")
				evidence.reply = result;
			if (evidence.line !== null) continue;
			const text = get(event, "text");
			if (get(event, "subtype") !== LOG_SUBTYPE || typeof text !== "string")
				continue;
			const groups = DECISION_LINE.exec(text)?.groups;
			if (!groups) continue;
			evidence.line = text;
			evidence.routed = true;
			const { tier, target, effort } = groups;
			evidence.tier = Number(tier) as Level;
			evidence.target = target ?? null;
			evidence.effort = effort ?? null;
		}
		return evidence;
	},
};
