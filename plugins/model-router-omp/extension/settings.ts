import { execFile } from "node:child_process";
import { basename } from "node:path";

export type TaskSettings = { enableEffort?: boolean; maxEffort?: string };
export type ReadSettings = (cwd: string) => Promise<TaskSettings>;
export type AskOmp = (cwd: string, key: string) => Promise<string | undefined>;

const ASK_TIMEOUT_MS = 2000;

// The extension runs inside omp: either its compiled binary, or Bun with the CLI entry as the first
// argument. A compiled binary also fills that argument, with a path inside its embedded file system.
export const ompCommand = (
	execPath = process.execPath,
	entry = process.argv[1],
): string[] =>
	basename(execPath).startsWith("bun") && entry
		? [execPath, entry]
		: [execPath];

// The child inherits the profile from the environment and the project from the working directory.
const askOmp: AskOmp = (cwd, key) =>
	new Promise((resolve) => {
		const [file = process.execPath, ...prefix] = ompCommand();
		execFile(
			file,
			[...prefix, "config", "get", key, "--json"],
			{ cwd, timeout: ASK_TIMEOUT_MS },
			(err, stdout) => resolve(err ? undefined : stdout),
		);
	});

const settingValue = (answer: string | undefined): unknown => {
	try {
		return answer === undefined ? undefined : JSON.parse(answer).value;
	} catch {
		return undefined;
	}
};

// omp gives extensions no settings API, so the extension asks the omp it runs in.
export async function readTaskSettings(
	cwd: string,
	ask: AskOmp = askOmp,
): Promise<TaskSettings> {
	const [enableEffort, maxEffort] = (
		await Promise.all([
			ask(cwd, "task.enableEffort"),
			ask(cwd, "task.maxEffort"),
		])
	).map(settingValue);
	return {
		...(typeof enableEffort === "boolean" ? { enableEffort } : {}),
		...(typeof maxEffort === "string" ? { maxEffort } : {}),
	};
}
