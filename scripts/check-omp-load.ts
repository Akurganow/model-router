import { type ChildProcessByStdio, spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { createInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";
import { BRIEF_GUIDANCE } from "#core/brief/guidance.ts";
import { errorText } from "#utils/error.ts";
import { EXIT_USAGE } from "./exit-codes.ts";

// Written out apart from the plugin's settings list, so a renamed command fails this check.
export const COMMANDS = [
	"model-router:provider",
	"model-router:gateway",
	"model-router:scope",
];

// omp refuses to start without a default model. The check's own server on the
// given port answers the prompt run, and the command run sends nothing.
export const stubModels = (port: number) => `providers:
  stub:
    baseUrl: http://127.0.0.1:${port}/v1
    api: openai-completions
    auth: none
    models:
      - id: stub
`;

const REQUEST_ID = "load";
const PROMPT_ID = "prompt";
const PROMPT_TEXT = "Reply with ok.";
const TIMEOUT_MS = 60_000;
const POLL_MS = 50;
const STUB_STATUS = 500;
// A message with another role carries the system prompt: omp sends it as
// system or, for a reasoning model, developer.
const CONVERSATION_ROLES = ["user", "assistant", "tool"];

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
 * Writes the stub provider for the given port into the omp agent folder unless
 * a models.yml is already there. Returns whether it wrote the file.
 */
export function writeStubModels(agentDir: string, port: number): boolean {
	const file = join(agentDir, "models.yml");
	if (existsSync(file)) return false;
	mkdirSync(agentDir, { recursive: true });
	writeFileSync(file, stubModels(port));
	return true;
}

// A local server that records each POST body and answers it with an error, so omp ends its turn.
export interface Stub {
	port: number;
	bodies: string[];
	close(): Promise<void>;
}

/** Starts the stub server on a free loopback port. */
export function startStub(): Promise<Stub> {
	const bodies: string[] = [];
	const server = createServer((request, response) => {
		const chunks: Buffer[] = [];
		request.on("data", (chunk: Buffer) => chunks.push(chunk));
		request.on("end", () => {
			if (request.method === "POST")
				bodies.push(Buffer.concat(chunks).toString("utf8"));
			response.statusCode = STUB_STATUS;
			response.end("{}");
		});
	});
	return new Promise((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			const port = typeof address === "object" && address ? address.port : 0;
			const close = () =>
				new Promise<void>((done) => {
					server.close(() => done());
					server.closeAllConnections();
				});
			resolve({ port, bodies, close });
		});
	});
}

/**
 * Lists what the requests omp sent to the stub get wrong: none arrived, or
 * none holds the brief text in a message that is not the user's, the model's
 * or a tool's. An empty list means omp put the text in its system prompt.
 */
export function promptProblems(bodies: readonly string[]): string[] {
	if (bodies.length === 0) return ["omp sent no request to the stub"];
	const carriesText = (body: string): boolean => {
		const messages = fieldsOf<"messages">(safeParse(body))?.messages;
		return (
			Array.isArray(messages) &&
			messages.some((message) => {
				const { role, content } = fieldsOf<"role" | "content">(message) ?? {};
				return (
					typeof role === "string" &&
					!CONVERSATION_ROLES.includes(role) &&
					typeof content === "string" &&
					content.includes(BRIEF_GUIDANCE)
				);
			})
		);
	};
	return bodies.some(carriesText)
		? []
		: [
				`omp sent ${bodies.length} request(s) to the stub and none holds the brief text in a system or developer message`,
			];
}

function safeParse(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}

// The parts of a spawned omp the check uses.
export type OmpProcess = Pick<
	ChildProcessByStdio<Writable, Readable, null>,
	"stdin" | "stdout" | "on" | "kill" | "exitCode" | "signalCode"
>;

// Closes omp's input and ends the process unless it already ended.
function stopOmp(child: OmpProcess): void {
	child.stdin.end();
	if (child.exitCode === null && child.signalCode === null) child.kill();
}

/**
 * Asks a started omp in rpc mode for its commands and resolves with the reply,
 * or with a problem text when omp exits, fails to start or stays silent past
 * the timeout. Stops omp once it has an answer.
 */
export function askCommands(
	child: OmpProcess,
	timeoutMs: number,
): Promise<{ reply: unknown } | { problem: string }> {
	return new Promise((resolve) => {
		let answered = false;
		const done = (result: { reply: unknown } | { problem: string }) => {
			// A failed kill() emits its error event before it returns, which calls done again.
			if (answered) return;
			answered = true;
			clearTimeout(timer);
			stopOmp(child);
			resolve(result);
		};
		const timer = setTimeout(
			() => done({ problem: `omp sent no reply within ${timeoutMs} ms` }),
			timeoutMs,
		);
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
		// An omp that exits before it reads the request fails the write with
		// EPIPE. The close event then reports its exit code.
		child.stdin.on("error", () => {});
		child.stdin.write(
			`${JSON.stringify({ id: REQUEST_ID, type: "get_available_commands" })}\n`,
		);
	});
}

/**
 * Sends a started omp in rpc mode a prompt and watches the requests it sends to
 * the stub. Resolves with no problem as soon as one holds the brief text in a
 * system or developer message, and otherwise with the problems at the timeout
 * or when omp exits. Stops omp on every path.
 */
export function askPrompt(
	child: OmpProcess,
	bodies: readonly string[],
	timeoutMs: number,
): Promise<string[]> {
	return new Promise((resolve) => {
		let finished = false;
		const done = (problems: string[]) => {
			// A failed kill() emits its error event before it returns, which calls done again.
			if (finished) return;
			finished = true;
			clearTimeout(timer);
			clearInterval(poll);
			stopOmp(child);
			resolve(problems);
		};
		const check = () => {
			if (promptProblems(bodies).length === 0) done([]);
		};
		const poll = setInterval(check, POLL_MS);
		const timer = setTimeout(
			() =>
				done(promptProblems(bodies).map((p) => `${p} within ${timeoutMs} ms`)),
			timeoutMs,
		);
		child.on("error", (error) => done([`omp did not start: ${error.message}`]));
		child.on("close", (code) => {
			check();
			done([`omp exited with code ${code} before it sent the brief text`]);
		});
		// An omp that exits before it reads the prompt fails the write with EPIPE.
		child.stdin.on("error", () => {});
		child.stdin.write(
			`${JSON.stringify({ id: PROMPT_ID, type: "prompt", message: PROMPT_TEXT })}\n`,
		);
	});
}

// Starts omp in rpc mode against the stub provider.
const startOmp = (command: readonly string[], env: NodeJS.ProcessEnv) => {
	const [file = "omp", ...args] = command;
	return spawn(
		file,
		[...args, "--mode", "rpc", "--no-ui", "--model", "stub/stub"],
		{ env, stdio: ["pipe", "pipe", "inherit"] },
	);
};

/**
 * Returns the exit code of the load check: 0 when omp loads the installed
 * plugin, lists each of its commands from the extension and puts the brief text
 * in its system prompt, EXIT_USAGE when PI_CODING_AGENT_DIR is unset or already
 * holds a models.yml, and 1 otherwise. The variable must name a temporary omp
 * config, because the check writes a stub provider there. An existing
 * models.yml is refused because the check cannot see the requests that go
 * through a file it did not write. Prints each problem. Never throws.
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
	let stub: Stub | undefined;
	try {
		stub = await startStub();
		if (!writeStubModels(agentDir, stub.port)) {
			console.error(
				`check-omp-load: ${join(agentDir, "models.yml")} exists. The check cannot see the requests that go through a file it did not write, so point PI_CODING_AGENT_DIR at an empty folder.`,
			);
			return EXIT_USAGE;
		}
		const result = await askCommands(startOmp(command, env), timeoutMs);
		const problems =
			"problem" in result ? [result.problem] : replyProblems(result.reply);
		if (problems.length === 0)
			problems.push(
				...(await askPrompt(startOmp(command, env), stub.bodies, timeoutMs)),
			);
		for (const problem of problems) console.error(problem);
		if (problems.length === 0)
			console.log(
				`omp loaded the plugin, lists ${COMMANDS.join(", ")} from the extension and sends the brief text in its system prompt.`,
			);
		return problems.length === 0 ? 0 : 1;
	} catch (error) {
		console.error(errorText(error));
		return 1;
	} finally {
		await stub?.close();
	}
}

if (import.meta.main) process.exit(await main(process.env));
