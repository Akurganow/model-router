import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { chooseEffort } from "../extension/effort.ts";
import { ompCommand, readTaskSettings } from "../extension/settings.ts";
import { jevAnswer, reply, tasksOf, useWorld } from "./helpers.ts";

const world = useWorld();

const FOUR = {
	reasoning: true,
	thinking: { efforts: ["low", "medium", "high", "xhigh"] },
};
const lastLine = () => world.notes.at(-1) ?? "";

describe("effort mode follows omp's settings", () => {
	test("with task.enableEffort off the router sets the agent and leaves effort to omp", async () => {
		world.settings = { enableEffort: false, maxEffort: "max" };
		const result = await world.run({ tasks: [{ task: "Do it" }] });
		assert.deepEqual(tasksOf(result), [
			{ task: "Do it", agent: "router_light" },
		]);
		assert.match(lastLine(), /L0 router_light · auto · p=/);
	});

	test("unreadable settings leave effort to omp", async () => {
		world.settings = {};
		const result = await world.run({ tasks: [{ task: "Do it" }] });
		assert.deepEqual(tasksOf(result), [
			{ task: "Do it", agent: "router_light" },
		]);
		assert.match(lastLine(), / · auto · /);
	});

	test("a caller's effort stays in either mode", async () => {
		world.settings = { enableEffort: false };
		const result = await world.run({
			tasks: [{ task: "Do it", effort: "hi" }],
		});
		assert.deepEqual(tasksOf(result), [
			{ task: "Do it", effort: "hi", agent: "router_light" },
		]);
		assert.match(lastLine(), / · caller effort · /);
	});
});

describe("the line shows the level omp applies", () => {
	test("med on a four-level model reads med→medium", async () => {
		await world.run(
			{ tasks: [{ task: "Do it" }] },
			{ models: { "@router_light": FOUR } },
		);
		assert.match(lastLine(), / · med→medium · /);
	});

	test("the agent's next selector stands in for an unset role", async () => {
		world.fetchWith(() => reply(jevAnswer(2, 2)));
		await world.run(
			{ tasks: [{ task: "Do it" }] },
			{ models: { "@slow": FOUR } },
		);
		assert.match(lastLine(), /L2 router_heavy · hi→xhigh · /);
	});

	test("task.maxEffort caps the applied level", async () => {
		world.settings = { enableEffort: true, maxEffort: "high" };
		world.fetchWith(() => reply(jevAnswer(2, 2)));
		await world.run(
			{ tasks: [{ task: "Do it" }] },
			{ models: { "@router_heavy": FOUR } },
		);
		assert.match(lastLine(), / · hi→high · /);
	});

	test("a cap below the model's lowest level leaves effort unset, where omp would fail the spawn", async () => {
		world.settings = { enableEffort: true, maxEffort: "minimal" };
		const result = await world.run(
			{ tasks: [{ task: "Do it" }] },
			{ models: { "@router_light": FOUR } },
		);
		assert.deepEqual(tasksOf(result), [
			{ task: "Do it", agent: "router_light" },
		]);
		assert.match(lastLine(), / · auto · /);
	});
});

describe("chooseEffort mirrors omp's mapping", () => {
	const even = {
		reasoning: true,
		thinking: { efforts: ["low", "medium", "high", "xhigh"] },
	};
	const odd = {
		reasoning: true,
		thinking: { efforts: ["low", "medium", "high"] },
	};
	test("lo, med and hi take the lowest, middle and highest level", () => {
		assert.deepEqual(chooseEffort("lo", odd), {
			effort: "lo",
			shown: "lo→low",
		});
		assert.deepEqual(chooseEffort("med", odd), {
			effort: "med",
			shown: "med→medium",
		});
		assert.deepEqual(chooseEffort("hi", odd), {
			effort: "hi",
			shown: "hi→high",
		});
	});
	test("med on an even range takes the lower middle", () => {
		assert.deepEqual(chooseEffort("med", even), {
			effort: "med",
			shown: "med→medium",
		});
	});
	test("an unknown or non-reasoning model shows the request only", () => {
		assert.deepEqual(chooseEffort("med", undefined), {
			effort: "med",
			shown: "med",
		});
		assert.deepEqual(chooseEffort("med", { reasoning: false }), {
			effort: "med",
			shown: "med",
		});
	});
});

describe("readTaskSettings", () => {
	const answers: Record<string, string> = {
		"task.enableEffort": '{"key":"task.enableEffort","value":true}',
		"task.maxEffort": '{"key":"task.maxEffort","value":"high"}',
	};
	test("asks omp for both settings in the working directory", async () => {
		const asked: string[] = [];
		const settings = await readTaskSettings("/work", async (cwd, key) => {
			asked.push(`${cwd} ${key}`);
			return answers[key];
		});
		assert.deepEqual(settings, { enableEffort: true, maxEffort: "high" });
		assert.deepEqual(asked.sort(), [
			"/work task.enableEffort",
			"/work task.maxEffort",
		]);
	});
	test("a failed or malformed answer leaves that setting unknown", async () => {
		const settings = await readTaskSettings("/work", async (_cwd, key) =>
			key === "task.enableEffort" ? "not json" : undefined,
		);
		assert.deepEqual(settings, {});
	});
});

describe("ompCommand", () => {
	test("a compiled omp runs itself, ignoring its embedded entry path", () => {
		assert.deepEqual(
			ompCommand("/opt/omp/bin/omp", "/$bunfs/root/omp-darwin-arm64"),
			["/opt/omp/bin/omp"],
		);
	});
	test("omp under Bun runs Bun with the CLI entry", () => {
		assert.deepEqual(ompCommand("/usr/local/bin/bun", "/lib/omp/cli.js"), [
			"/usr/local/bin/bun",
			"/lib/omp/cli.js",
		]);
	});
});
