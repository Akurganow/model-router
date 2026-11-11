import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { EXIT_USAGE } from "./exit-codes.ts";

// Written out apart from the plugin's settings list, so a renamed command fails this check.
export const COMMANDS = ["model-router:provider", "model-router:scope"];

// omp refuses to start without a default model. No prompt is sent, so nothing calls this address.
export const STUB_MODELS = `providers:
  stub:
    baseUrl: http://127.0.0.1:9/v1
    api: openai-completions
    auth: none
    models:
      - id: stub
`;

const REQUEST_ID = "load";
const TIMEOUT_MS = 60_000;

// An object read for the named fields, each of which may be absent or of any type.
type Fields<K extends string> = Partial<Record<K, unknown>>;
/**
 * Returns the value as an object whose named fields may be absent or of any
 * type, or undefined when it is not an object. Never throws.
 */
const fieldsOf = <K extends string>(value: unknown): Fields<K> | undefined =>
	typeof value === "object" && value !== null
		? (value as Fields<K>)
		: undefined;

/**
 * Lists what an omp rpc reply to `get_available_commands` gets wrong: each
 * plugin command that is missing, or listed from another source than the
 * extension. An empty list means the extension loaded and registered every
 * command. Never throws.
 */
export function replyProblems(reply: unknown): string[] {
	const fields = fieldsOf<"success" | "error" | "data">(reply);
	if (fields === undefined) return ["the reply is not an object"];
	if (fields.success === false)
		return [`omp answered with an error: ${String(fields.error)}`];
	const commands = fieldsOf<"commands">(fields.data)?.commands;
	if (!Array.isArray(commands)) return ["the reply lists no commands"];
	return COMMANDS.flatMap((name) => {
		const found = commands
			.map((command) => fieldsOf<"name" | "source">(command))
			.find((command) => command?.name === name);
		if (found === undefined) return [`${name} is not listed`];
		const { source } = found;
		return source === "extension"
			? []
			: [`${name} is listed from ${String(source)}, not from the extension`];
	});
}

/**
 * Writes the stub provider into the omp agent folder unless a models.yml is
 * already there. Returns whether it wrote the file.
 */
export function writeStubModels(agentDir: string): boolean {
	const file = join(agentDir, "models.yml");
	if (existsSync(file)) return false;
	mkdirSync(agentDir, { recursive: true });
	writeFileSync(file, STUB_MODELS);
	return true;
}

/**
 * Starts omp in rpc mode, asks for its commands and resolves with the reply,
 * or with a problem text when omp exits, fails to start or stays silent past
 * the timeout. Closes omp's stdin after the reply, so omp exits.
 */
function askCommands(
	command: readonly string[],
	env: NodeJS.ProcessEnv,
	timeoutMs: number,
): Promise<{ reply: unknown } | { problem: string }> {
	const [file = "omp", ...args] = command;
	const child = spawn(
		file,
		[...args, "--mode", "rpc", "--no-ui", "--model", "stub/stub"],
		{ env, stdio: ["pipe", "pipe", "inherit"] },
	);
	return new Promise((resolve) => {
		const done = (result: { reply: unknown } | { problem: string }) => {
			clearTimeout(timer);
			child.stdin.end();
			resolve(result);
		};
		const timer = setTimeout(() => {
			child.kill();
			done({ problem: `omp sent no reply within ${timeoutMs} ms` });
		}, timeoutMs);
		child.on("error", (error) =>
			done({ problem: `omp did not start: ${error.message}` }),
		);
		child.on("close", (code) =>
			done({ problem: `omp exited with code ${code} before it replied` }),
		);
		createInterface({ input: child.stdout }).on("line", (line) => {
			let message: unknown;
			try {
				message = JSON.parse(line);
			} catch {
				return;
			}
			const fields = fieldsOf<"type" | "id">(message);
			if (fields?.type === "response" && fields.id === REQUEST_ID)
				done({ reply: message });
		});
		child.stdin.write(
			`${JSON.stringify({ id: REQUEST_ID, type: "get_available_commands" })}\n`,
		);
	});
}

/**
 * Returns the exit code of the load check: 0 when omp loads the installed
 * plugin and lists each of its commands from the extension, EXIT_USAGE when
 * PI_CODING_AGENT_DIR is unset, and 1 otherwise. The variable must name a
 * temporary omp config, because the check writes a stub provider there.
 * Prints each problem. Never throws.
 */
export async function main(
	env: NodeJS.ProcessEnv,
	command: readonly string[] = ["omp"],
	timeoutMs = TIMEOUT_MS,
): Promise<number> {
	const { PI_CODING_AGENT_DIR: agentDir } = env;
	if (agentDir === undefined || agentDir === "") {
		console.error(
			"check-omp-load: PI_CODING_AGENT_DIR is unset. Set it to a temporary omp config folder, because the check writes a stub provider there.",
		);
		return EXIT_USAGE;
	}
	try {
		writeStubModels(agentDir);
		const result = await askCommands(command, env, timeoutMs);
		const problems =
			"problem" in result ? [result.problem] : replyProblems(result.reply);
		for (const problem of problems) console.error(problem);
		if (problems.length === 0)
			console.log(
				`omp loaded the plugin and lists ${COMMANDS.join(", ")} from the extension.`,
			);
		return problems.length === 0 ? 0 : 1;
	} catch (error) {
		console.error(error instanceof Error ? error.message : error);
		return 1;
	}
}

if (import.meta.main) process.exit(await main(process.env));
