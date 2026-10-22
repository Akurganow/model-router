import type { Level } from "../../src/model.ts";
import { get, isRecord, jsonLines } from "./stream.ts";
import type { Adapter, Evidence } from "./types.ts";

const SPAWN_TOOL = "task";
// Background tasks, omp's default, let print mode exit before the subagent's answer arrives.
const SETTINGS_OVERLAY = "omp-evals.yml";
// The extension prints "model-router task <n>: L<level> <role> · p=…" to stderr when omp has no UI.
// A batch is one line of entries joined by " | ". The role is "no change" when the task keeps its model.
const LINE_PREFIX = "model-router ";
const ENTRY_SEPARATOR = " | ";
const NO_CHANGE = "no change";
const DECISION_ENTRY = new RegExp(
	`^task \\d+: L([012]) (@\\w+|${NO_CHANGE}) · p=\\d+(?:\\.\\d+)?`,
);

function spawnCount(stdout: string): number {
	let count = 0;
	for (const event of jsonLines(stdout)) {
		if (
			get(event, "type") !== "tool_execution_start" ||
			get(event, "toolName") !== SPAWN_TOOL
		)
			continue;
		const args = get(event, "args");
		const tasks = isRecord(args) ? get(args, "tasks") : undefined;
		count += Array.isArray(tasks) ? tasks.length : 1;
	}
	return count;
}

function lastReply(stdout: string): string | null {
	let reply: string | null = null;
	for (const event of jsonLines(stdout)) {
		const message = get(event, "message");
		if (get(event, "type") !== "message_end" || !isRecord(message)) continue;
		const content = get(message, "content");
		if (get(message, "role") !== "assistant" || !Array.isArray(content))
			continue;
		const text = content
			.map((b) =>
				isRecord(b) && get(b, "type") === "text" ? get(b, "text") : "",
			)
			.join("");
		if (text.trim() !== "") reply = text.trim();
	}
	return reply;
}

export const omp: Adapter = {
	files: { [SETTINGS_OVERLAY]: "async:\n  enabled: false\n" },
	command: (prompt, model) => [
		"omp",
		"-p",
		"--config",
		SETTINGS_OVERLAY,
		"--mode",
		"json",
		"--no-session",
		"--no-title",
		"--auto-approve",
		// The case needs only the spawn and a file read, so no shell can read the keys in the environment.
		"--tools",
		"task,read",
		"--thinking",
		"low",
		"--model",
		model,
		"--smol",
		model,
		"--slow",
		model,
		prompt,
	],
	parse({ stdout, stderr }) {
		const evidence: Evidence = {
			spawns: spawnCount(stdout),
			routed: false,
			line: null,
			tier: null,
			effort: null,
			target: null,
			reply: lastReply(stdout),
		};
		for (const text of stderr.split("\n")) {
			if (!text.startsWith(LINE_PREFIX)) continue;
			for (const entry of text
				.slice(LINE_PREFIX.length)
				.split(ENTRY_SEPARATOR)) {
				const match = DECISION_ENTRY.exec(entry);
				if (!match) continue;
				evidence.routed = true;
				evidence.line = entry;
				evidence.tier = Number(match[1]) as Level;
				evidence.target = match[2] === NO_CHANGE ? null : (match[2] ?? null);
				return evidence;
			}
		}
		return evidence;
	},
};
