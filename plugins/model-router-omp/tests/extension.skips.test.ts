import assert from "node:assert/strict";
import { join } from "node:path";
import { describe, test } from "node:test";
import { jevAnswer, reply, setEnv, tasksOf, useWorld } from "./helpers.ts";

const world = useWorld();

const AGENT = "---\nname: task\n---\nMy own task agent.\n";
const userAgents = () => join(world.home, ".omp", "agent", "agents");
const projectAgents = (root: string) => join(root, ".omp", "agents");

describe("a custom task agent skips the batch", () => {
	const batch = { tasks: [{ task: "a" }, { task: "b" }] };

	test("in the user agent folder", async () => {
		world.put(join(userAgents(), "task.md"), AGENT);
		assert.equal(await world.run(batch), undefined);
		assert.equal(world.calls.length, 0);
		assert.equal(
			world.notes[0],
			"model-router task 1: skipped, custom task agent | task 2: skipped, custom task agent",
		);
	});

	test("in the agent folder of an omp profile", async () => {
		const profileDir = join(world.home, ".omp", "profiles", "work", "agent");
		setEnv("PI_CODING_AGENT_DIR", profileDir);
		world.put(join(profileDir, "agents", "task.md"), AGENT);
		assert.equal(await world.run(batch), undefined);
		assert.equal(world.calls.length, 0);
	});

	test("in the project agent folder", async () => {
		world.put(join(projectAgents(world.project), "task.md"), AGENT);
		assert.equal(await world.run(batch), undefined);
		assert.equal(world.calls.length, 0);
		assert.match(world.notes[0] ?? "", /skipped, custom task agent/);
	});

	test("in the nearest project agent folder above the working directory", async () => {
		world.put(join(projectAgents(world.project), "task.md"), AGENT);
		const nested = join(world.project, "src", "deep");
		world.put(join(nested, "keep"), "");
		assert.equal(await world.run(batch, { cwd: nested }), undefined);
		assert.equal(world.calls.length, 0);
	});

	test("but not in a farther project agent folder", async () => {
		world.put(join(projectAgents(world.project), "task.md"), AGENT);
		const nested = join(world.project, "src");
		world.put(join(projectAgents(nested), "other.md"), AGENT);
		const result = await world.run(batch, { cwd: nested });
		assert.equal(tasksOf(result).length, 2);
		assert.equal(world.calls.length, 2);
	});

	test("an agent file with another name does not skip", async () => {
		world.put(join(userAgents(), "reviewer.md"), AGENT);
		const result = await world.run(batch);
		assert.equal(tasksOf(result).length, 2);
		assert.equal(world.calls.length, 2);
	});
});

describe("a missing key skips the batch", () => {
	test("with no credential and no variable", async () => {
		const result = await world.run(
			{ tasks: [{ task: "a" }] },
			{ key: async () => undefined },
		);
		assert.equal(result, undefined);
		assert.equal(world.calls.length, 0);
		assert.equal(world.notes[0], "model-router task 1: skipped, api_key unset");
	});

	test("with an empty credential and an empty variable", async () => {
		setEnv("TYPESAFE_API_KEY", "");
		await world.run({ tasks: [{ task: "a" }] }, { key: async () => "" });
		assert.equal(world.calls.length, 0);
		assert.match(world.notes[0] ?? "", /api_key unset/);
	});
});

describe("items the router leaves alone", () => {
	test("other agents, a non-string task and an empty task stay untouched", async () => {
		world.fetchWith(() => reply(jevAnswer(1, 1)));
		const untouched = [
			{ task: "explore", agent: "explore" },
			{ task: 42 },
			{ task: "" },
			{ agent: "task" },
			"not an object",
			null,
		];
		const result = await world.run({ tasks: [...untouched, { task: "a" }] });
		assert.deepEqual(tasksOf(result), [
			...untouched,
			{ task: "a", agent: "router_mid", effort: "med" },
		]);
		assert.equal(world.calls.length, 1);
		assert.match(world.notes[0] ?? "", /^model-router task 7: L1 /);
	});

	test("a batch with nothing eligible returns nothing and says nothing", async () => {
		const result = await world.run({
			tasks: [{ task: "x", agent: "explore" }],
		});
		assert.equal(result, undefined);
		assert.equal(world.notes.length, 0);
		assert.equal(world.calls.length, 0);
	});

	for (const [name, input] of [
		["a missing tasks list", { context: "c" }],
		["an empty tasks list", { tasks: [] }],
		["a tasks value that is not a list", { tasks: "do it" }],
	] as const) {
		test(name, async () => {
			assert.equal(await world.run(input), undefined);
			assert.equal(world.notes.length, 0);
			assert.equal(world.calls.length, 0);
		});
	}

	test("an item the router could not score keeps its agent and effort", async () => {
		world.fetchWith((_call, n) =>
			n === 0 ? reply("", 401) : reply(jevAnswer(2, 2)),
		);
		const result = await world.run({
			tasks: [{ task: "a" }, { task: "b" }],
		});
		assert.deepEqual(tasksOf(result), [
			{ task: "a" },
			{ task: "b", agent: "router_heavy", effort: "hi" },
		]);
		assert.match(
			world.notes[0] ?? "",
			/^model-router task 1: skipped, HTTP 401 \| task 2: L2 router_heavy/,
		);
	});
});
