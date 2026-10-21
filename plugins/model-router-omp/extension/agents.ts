import { statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const TASK_AGENT_FILE = "task.md";
// omp's discovery reads user agents in the agent folder and the nearest project folder with this name
// (task/discovery.ts). A profile moves the agent folder and names it in PI_CODING_AGENT_DIR.
const DEFAULT_AGENT_DIR = join(".omp", "agent");
const AGENTS_DIR = "agents";
const PROJECT_AGENTS = join(".omp", AGENTS_DIR);

const stat = (path: string) => {
	try {
		return statSync(path);
	} catch {
		return undefined;
	}
};

function nearestProjectAgents(cwd: string): string | undefined {
	for (let dir = cwd; ; dir = dirname(dir)) {
		const candidate = join(dir, PROJECT_AGENTS);
		if (stat(candidate)?.isDirectory()) return candidate;
		if (dirname(dir) === dir) return undefined;
	}
}

const agentFolder = (): string => {
	const { PI_CODING_AGENT_DIR } = process.env;
	return PI_CODING_AGENT_DIR || join(homedir(), DEFAULT_AGENT_DIR);
};

// A user's own `task` agent replaces omp's bundled one, so the router must not swap it out.
export function hasCustomTaskAgent(
	cwd: string,
	agentDir = agentFolder(),
): boolean {
	return [join(agentDir, AGENTS_DIR), nearestProjectAgents(cwd)].some(
		(dir) => dir !== undefined && stat(join(dir, TASK_AGENT_FILE))?.isFile(),
	);
}
