import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { PassThrough, Writable } from "node:stream";
import { test } from "node:test";
import { BRIEF_GUIDANCE } from "#core/brief/guidance.ts";
import { VALUE_SETTINGS } from "#core/options/settings.ts";
import {
	askCommands,
	askPrompt,
	COMMANDS,
	main,
	type OmpProcess,
	replyProblems,
	writeStubModels,
} from "./check-omp-load.ts";
import { EXIT_USAGE } from "./exit-codes.ts";
import { useTempRoot } from "./temp-root.ts";

const temp = useTempRoot("check-omp-load-");

const reply = (commands: unknown) => ({
	type: "response",
	id: "load",
	success: true,
	data: { commands },
});
const extension = (name: string) => ({ name, source: "extension" });

test("the load check expects one command per value setting", () => {
	assert.deepEqual(
		COMMANDS,
		VALUE_SETTINGS.map((setting) => `model-router:${setting}`),
	);
});

test("a reply listing every command from the extension is clean", () => {
	assert.deepEqual(
		replyProblems(
			reply([{ name: "help", source: "builtin" }, ...COMMANDS.map(extension)]),
		),
		[],
	);
});

test("a reply that lacks a command or lists it from elsewhere names it", () => {
	const [first = "", second = "", third = ""] = COMMANDS;
	assert.deepEqual(replyProblems(reply([{ name: first, source: "prompt" }])), [
		`${first} is listed from prompt, not from the extension`,
		`${second} is not listed`,
		`${third} is not listed`,
	]);
});

test("a reply that is not a command list is one problem", () => {
	for (const bad of [null, "text", { type: "response" }, reply("none")])
		assert.equal(replyProblems(bad).length, 1, JSON.stringify(bad));
	assert.deepEqual(
		replyProblems({ type: "response", success: false, error: "boom" }),
		["omp answered with an error: boom"],
	);
});

test("the stub models file is written only where none exists", () => {
	const dir = join(temp.root, "agent");
	assert.equal(writeStubModels(dir, 4321), true);
	assert.match(temp.read("agent/models.yml"), /127\.0\.0\.1:4321\/v1\n/);
	temp.put("agent/models.yml", "own: true\n");
	assert.equal(writeStubModels(dir, 4321), false);
	assert.equal(temp.read("agent/models.yml"), "own: true\n");
});

test("the load check refuses to run without a temporary omp config", async () => {
	assert.equal(await main({}, ["omp"]), EXIT_USAGE);
});

// A stand-in omp that answers get_available_commands with the given commands,
// and answers a prompt by posting the brief text in a system message to the
// stub provider that the check wrote into models.yml.
const fakeOmp = (commands: unknown) => `
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";
for await (const line of createInterface({ input: process.stdin })) {
	const { id, type } = JSON.parse(line);
	if (type === "get_available_commands")
		console.log(JSON.stringify({ type: "response", id, success: true, data: { commands: ${JSON.stringify(commands)} } }));
	if (type === "prompt") {
		const yml = readFileSync(process.env.PI_CODING_AGENT_DIR + "/models.yml", "utf8");
		const port = /127\\.0\\.0\\.1:(\\d+)/.exec(yml)[1];
		await fetch("http://127.0.0.1:" + port + "/v1/chat/completions", {
			method: "POST",
			body: JSON.stringify({ messages: [{ role: "system", content: ${JSON.stringify(BRIEF_GUIDANCE)} }] }),
		}).catch(() => {});
	}
}
`;

test("the load check passes when omp lists every command and sends the brief text to the stub", async () => {
	temp.put("omp.mjs", fakeOmp(COMMANDS.map(extension)));
	const env = { PI_CODING_AGENT_DIR: join(temp.root, "agent") };
	assert.equal(
		await main(env, [process.execPath, join(temp.root, "omp.mjs")]),
		0,
	);
});

test("the load check fails when omp lists no command of the plugin", async () => {
	temp.put("omp.mjs", fakeOmp([]));
	const env = { PI_CODING_AGENT_DIR: join(temp.root, "agent") };
	assert.equal(
		await main(env, [process.execPath, join(temp.root, "omp.mjs")]),
		1,
	);
});

test("the load check fails when omp exits without a reply", async () => {
	temp.put("omp.mjs", "process.exit(3);\n");
	const env = { PI_CODING_AGENT_DIR: join(temp.root, "agent") };
	assert.equal(
		await main(env, [process.execPath, join(temp.root, "omp.mjs")]),
		1,
	);
});

test("the load check fails after the timeout when omp never answers", async () => {
	temp.put("omp.mjs", "setInterval(() => {}, 1000);\n");
	const env = { PI_CODING_AGENT_DIR: join(temp.root, "agent") };
	assert.equal(
		await main(env, [process.execPath, join(temp.root, "omp.mjs")], 200),
		1,
	);
	assert.ok(existsSync(join(temp.root, "agent/models.yml")));
});

/**
 * A stand-in omp process. Its stdin fails every write with the given error, or
 * takes it, and kill() records the call.
 */
function fakeProcess(writeError?: Error) {
	const child = new EventEmitter() as EventEmitter & {
		stdin: Writable;
		stdout: PassThrough;
		exitCode: number | null;
		signalCode: NodeJS.Signals | null;
		kills: number;
		kill(): boolean;
	};
	child.stdin = new Writable({
		write: (_chunk, _encoding, callback) => callback(writeError),
	});
	child.stdout = new PassThrough();
	child.exitCode = null;
	child.signalCode = null;
	child.kills = 0;
	child.kill = () => {
		child.kills += 1;
		return true;
	};
	return child;
}

test("an omp that exits before it reads the request reports its exit code", async () => {
	const child = fakeProcess(
		Object.assign(new Error("write EPIPE"), { code: "EPIPE" }),
	);
	const result = askCommands(child as unknown as OmpProcess, 1000);
	setImmediate(() => {
		child.exitCode = 3;
		child.emit("close", 3);
	});
	assert.deepEqual(await result, {
		problem: "omp exited with code 3 before it replied",
	});
});

test("the load check stops omp after its reply", async () => {
	const child = fakeProcess();
	const result = askCommands(child as unknown as OmpProcess, 1000);
	child.stdout.write(
		`${JSON.stringify({ ...reply(COMMANDS.map(extension)) })}\n`,
	);
	assert.deepEqual(await result, { reply: reply(COMMANDS.map(extension)) });
	assert.equal(child.kills, 1);
});

test("a kill that fails at once does not stop omp's answer from coming back", async () => {
	const child = fakeProcess();
	// Node's kill() emits a failure as an error event before it returns.
	child.kill = () => {
		child.kills += 1;
		child.emit("error", new Error("kill EPERM"));
		return false;
	};
	const result = askCommands(child as unknown as OmpProcess, 1000);
	child.stdout.write(`${JSON.stringify(reply(COMMANDS.map(extension)))}\n`);
	assert.deepEqual(await result, { reply: reply(COMMANDS.map(extension)) });
	assert.equal(child.kills, 1);
});

test("the load check refuses an existing models.yml and leaves it alone", async (t) => {
	const error = t.mock.method(console, "error", () => {});
	temp.put("agent/models.yml", "own: true\n");
	temp.put("omp.mjs", fakeOmp(COMMANDS.map(extension)));
	const env = { PI_CODING_AGENT_DIR: join(temp.root, "agent") };
	assert.equal(
		await main(env, [process.execPath, join(temp.root, "omp.mjs")]),
		EXIT_USAGE,
	);
	assert.equal(temp.read("agent/models.yml"), "own: true\n");
	const lines = error.mock.calls.map(({ arguments: [line] }) => String(line));
	assert.ok(
		lines.some((line) => line.includes(join(temp.root, "agent/models.yml"))),
		lines.join("\n"),
	);
});

const request = (role: string, content = BRIEF_GUIDANCE) =>
	JSON.stringify({ messages: [{ role, content }] });
const prompted = (bodies: string[], child = fakeProcess(), timeoutMs = 100) =>
	askPrompt(child as unknown as OmpProcess, bodies, timeoutMs);

test("the prompt check passes on the text in a system message and stops omp", async () => {
	const child = fakeProcess();
	assert.deepEqual(await prompted([request("system")], child, 1000), []);
	assert.equal(child.kills, 1);
});

test("the prompt check fails on the text in a user message, on another text and on no request", async () => {
	const first = async (bodies: string[]) => (await prompted(bodies))[0] ?? "";
	assert.match(await first([request("user")]), /sent 1 request.*brief text/);
	assert.match(await first([request("system", "other")]), /sent 1 request/);
	assert.match(await first([]), /sent no request/);
});
