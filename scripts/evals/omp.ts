import { get, isRecord, jsonLines } from "./stream.ts";
import type { Adapter, Evidence, Tier } from "./types.ts";

const SPAWN_TOOL = "task";
const ROUTER_AGENT = /^router_(?:light|mid|heavy)$/;
// Without a UI the extension writes "model-router task <n>: L<tier> <agent> · <effort> · p=…" to stderr.
const DECISION_ENTRY =
	/^model-router (task \d+: L([012]) (router_\w+) · (caller effort|[^\s·]+) · p=\d+(?:\.\d+)?\/\d+(?:\.\d+)?.*)$/;

// The extension rewrites the task input before the start event, so the event carries the routed agent.
function spawnedAgents(stdout: string): (string | null)[] {
	const agents: (string | null)[] = [];
	for (const event of jsonLines(stdout)) {
		if (
			get(event, "type") !== "tool_execution_start" ||
			get(event, "toolName") !== SPAWN_TOOL
		)
			continue;
		const args = get(event, "args");
		const tasks = isRecord(args) ? get(args, "tasks") : undefined;
		if (!Array.isArray(tasks)) {
			agents.push(null);
			continue;
		}
		for (const item of tasks) {
			const agent = isRecord(item) ? get(item, "agent") : undefined;
			agents.push(typeof agent === "string" ? agent : null);
		}
	}
	return agents;
}

export const omp: Adapter = {
	name: "omp",
	command: (prompt, model) => [
		"omp",
		"-p",
		"--mode",
		"json",
		"--no-session",
		"--no-title",
		"--auto-approve",
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
		const agents = spawnedAgents(stdout);
		const first = agents[0] ?? null;
		const evidence: Evidence = {
			spawns: agents.length,
			routed: first !== null && ROUTER_AGENT.test(first),
			line: null,
			tier: null,
			effort: null,
			target: first,
		};
		for (const text of stderr.split("\n")) {
			const match = DECISION_ENTRY.exec(text);
			if (!match) continue;
			evidence.line = match[1] ?? null;
			evidence.tier = Number(match[2]) as Tier;
			evidence.effort = match[4] ?? null;
			break;
		}
		return evidence;
	},
};
