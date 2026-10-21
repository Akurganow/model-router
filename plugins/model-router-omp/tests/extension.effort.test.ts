import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { chooseEffort, chooseLightEffort } from "../extension/effort.ts";
import extension from "../extension/index.ts";
import { ompCommand, readTaskSettings } from "../extension/settings.ts";
import { jevAnswer, reply, taskEvent, tasksOf, useWorld } from "./helpers.ts";

const world = useWorld();

const FOUR = {
	reasoning: true,
	thinking: { efforts: ["low", "medium", "high", "xhigh"] },
};
const lastLine = () => world.notes.at(-1) ?? "";
const ROUTED_ONLY = [{ task: "Do it", agent: "router_light" }];

describe("effort mode follows omp's settings", () => {
	const autoCases = [
		["with task.enableEffort off", { enableEffort: false, maxEffort: "max" }],
		["with unreadable settings", {}],
	] as const;
	for (const [name, settings] of autoCases)
		test(`${name} the router sets the agent and leaves effort to omp`, async () => {
			world.settings = settings;
			const result = await world.run({ tasks: [{ task: "Do it" }] });
			assert.deepEqual(tasksOf(result), ROUTED_ONLY);
			assert.match(lastLine(), /L0 router_light · auto · p=/);
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
		assert.match(lastLine(), /L2 router_heavy · med→medium · /);
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
		assert.deepEqual(tasksOf(result), ROUTED_ONLY);
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
			applied: "low",
		});
		assert.deepEqual(chooseEffort("med", odd), {
			effort: "med",
			shown: "med→medium",
			applied: "medium",
		});
		assert.deepEqual(chooseEffort("hi", odd), {
			effort: "hi",
			shown: "hi→high",
			applied: "high",
		});
	});
	test("med on an even range takes the lower middle", () => {
		assert.deepEqual(chooseEffort("med", even), {
			effort: "med",
			shown: "med→medium",
			applied: "medium",
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
	test("an omp that does not answer leaves both settings unknown", async () => {
		assert.deepEqual(await readTaskSettings(world.project), {});
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
	test("any other program gets no command, so Node never runs a project's config.js", () => {
		assert.equal(ompCommand("/usr/local/bin/node", "/work/test.ts"), undefined);
	});
	test("omp under Bun runs Bun with the CLI entry", () => {
		assert.deepEqual(ompCommand("/usr/local/bin/bun", "/lib/omp/cli.js"), [
			"/usr/local/bin/bun",
			"/lib/omp/cli.js",
		]);
	});
});

describe("the light tier never runs at the model's lowest level", () => {
	const two = { reasoning: true, thinking: { efforts: ["low", "high"] } };
	const haiku = {
		reasoning: true,
		thinking: { efforts: ["minimal", "low", "medium", "high"] },
	};
	test("med that lands on the lowest level moves up to hi", () => {
		assert.deepEqual(chooseLightEffort("med", two), {
			effort: "hi",
			shown: "hi→high",
			applied: "high",
		});
	});
	test("med above the lowest level stays", () => {
		assert.deepEqual(chooseLightEffort("med", haiku), {
			effort: "med",
			shown: "med→low",
			applied: "low",
		});
	});
	test("a cap that pins hi to the lowest level keeps the request as it is", () => {
		assert.deepEqual(chooseLightEffort("med", two, "low"), {
			effort: "med",
			shown: "med→low",
			applied: "low",
		});
	});
	test("the router applies it to router_light only", async () => {
		await world.run(
			{ tasks: [{ task: "Do it" }] },
			{ models: { "@router_light": two } },
		);
		assert.match(lastLine(), /L0 router_light · hi→high · /);
		world.fetchWith(() => reply(jevAnswer(1, 1)));
		await world.run(
			{ tasks: [{ task: "Do it" }] },
			{ models: { "@router_mid": two } },
		);
		assert.match(lastLine(), /L1 router_mid · med→low · /);
	});
});

describe("the router never asks for a level above high", () => {
	const upToMax = {
		reasoning: true,
		thinking: { efforts: ["low", "medium", "high", "max"] },
	};
	test("hi that would land on max steps down to med", async () => {
		world.fetchWith(() => reply(jevAnswer(2, 2)));
		const result = await world.run(
			{ tasks: [{ task: "Do it" }] },
			{ models: { "@router_heavy": upToMax } },
		);
		assert.deepEqual(tasksOf(result), [
			{ task: "Do it", agent: "router_heavy", effort: "med" },
		]);
		assert.match(lastLine(), / · med→medium · /);
	});
	test("with a high cap, hi stays and omp clamps it to high", async () => {
		world.settings = { enableEffort: true, maxEffort: "high" };
		world.fetchWith(() => reply(jevAnswer(2, 2)));
		await world.run(
			{ tasks: [{ task: "Do it" }] },
			{ models: { "@router_heavy": upToMax } },
		);
		assert.match(lastLine(), / · hi→high · /);
	});
	test("a model with nothing at or below high gets no effort", async () => {
		world.fetchWith(() => reply(jevAnswer(2, 2)));
		const result = await world.run(
			{ tasks: [{ task: "Do it" }] },
			{
				models: {
					"@router_heavy": {
						reasoning: true,
						thinking: { efforts: ["xhigh", "max"] },
					},
				},
			},
		);
		assert.deepEqual(tasksOf(result), [
			{ task: "Do it", agent: "router_heavy" },
		]);
		assert.match(lastLine(), / · auto · /);
	});
});

describe("settings reads", () => {
	test("a settings read that throws counts as omp's auto", async () => {
		const handlers: Parameters<Parameters<typeof extension>[0]["on"]>[1][] = [];
		extension({ on: (_e, h) => void handlers.push(h) }, async () => {
			throw new Error("broken");
		});
		const result = await handlers[0]?.(
			taskEvent({ tasks: [{ task: "Do it" }] }),
			world.makeCtx(),
		);
		assert.deepEqual(tasksOf(result), ROUTED_ONLY);
		assert.match(lastLine(), / · auto · /);
	});
	test("without a key the settings are not read", async () => {
		let reads = 0;
		const handlers: Parameters<Parameters<typeof extension>[0]["on"]>[1][] = [];
		extension({ on: (_e, h) => void handlers.push(h) }, async () => {
			reads += 1;
			return {};
		});
		await handlers[0]?.(
			taskEvent({ tasks: [{ task: "Do it" }] }),
			world.makeCtx({ key: async () => undefined }),
		);
		assert.equal(reads, 0);
	});
});

test("an item name reaches Jev masked and cut", async () => {
	await world.run({
		tasks: [{ task: "Do it", name: `API_KEY=hunter22 ${"n".repeat(500)}` }],
	});
	const description = world.calls[0]?.body.state.description ?? "";
	assert.ok(!description.includes("hunter22"));
	assert.ok(description.length <= 200);
});
