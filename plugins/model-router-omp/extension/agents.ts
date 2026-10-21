import { statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const TASK_AGENT_FILE = "task.md";
// omp's discovery reads user agents here and the nearest project folder with this name (task/discovery.ts).
const USER_AGENTS = join(".omp", "agent", "agents");
const PROJECT_AGENTS = join(".omp", "agents");

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

// A user's own `task` agent replaces omp's bundled one, so the router must not swap it out.
export function hasCustomTaskAgent(cwd: string, home = homedir()): boolean {
	return [join(home, USER_AGENTS), nearestProjectAgents(cwd)].some(
		(dir) => dir !== undefined && stat(join(dir, TASK_AGENT_FILE))?.isFile(),
	);
}
