import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { VALUE_SETTINGS } from "../src/settings.ts";
import {
	COMMANDS,
	main,
	replyProblems,
	STUB_MODELS,
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
	const [first = "", second = ""] = COMMANDS;
	assert.deepEqual(replyProblems(reply([{ name: first, source: "prompt" }])), [
		`${first} is listed from prompt, not from the extension`,
		`${second} is not listed`,
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
	assert.equal(writeStubModels(dir), true);
	assert.equal(temp.read("agent/models.yml"), STUB_MODELS);
	temp.put("agent/models.yml", "own: true\n");
	assert.equal(writeStubModels(dir), false);
	assert.equal(temp.read("agent/models.yml"), "own: true\n");
});

test("the load check refuses to run without a temporary omp config", async () => {
	assert.equal(await main({}, ["omp"]), EXIT_USAGE);
});

// A stand-in omp that answers one get_available_commands line with the given commands.
const fakeOmp = (commands: unknown) => `
import { createInterface } from "node:readline";
for await (const line of createInterface({ input: process.stdin })) {
	const { id, type } = JSON.parse(line);
	if (type === "get_available_commands")
		console.log(JSON.stringify({ type: "response", id, success: true, data: { commands: ${JSON.stringify(commands)} } }));
}
`;

test("the load check passes when omp lists every command and writes the stub", async () => {
	temp.put("omp.mjs", fakeOmp(COMMANDS.map(extension)));
	const env = { PI_CODING_AGENT_DIR: join(temp.root, "agent") };
	assert.equal(
		await main(env, [process.execPath, join(temp.root, "omp.mjs")]),
		0,
	);
	assert.equal(temp.read("agent/models.yml"), STUB_MODELS);
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
