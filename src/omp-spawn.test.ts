import assert from "node:assert/strict";
import { test } from "node:test";
import { AGENTS } from "./omp-fake-agents.ts";
import { streamed, useWorld } from "./omp-fakes.ts";
import { createExtension } from "./omp-router.ts";
import { STORE_MAX } from "./omp-store.ts";

const world = useWorld();
const install = () => createExtension(world.imports)(world.pi);
const twoTasks = () =>
	world.toolCall("c", { tasks: [{ task: "level0 a" }, { task: "level2 b" }] });
const LINE = "L2 @slow · p=0.90 · jev jev-1.14.0 · 812/9 tok";

test("sync mode: an unnamed item is found by its call and index", async () => {
	install();
	await twoTasks();
	assert.equal((await world.spawn("c:0"))?.model, "@smol");
	const second = await world.spawn("c:1");
	assert.deepEqual(second, { model: "@slow", note: `model-router ${LINE}` });
});

test("sync mode: a named item is found by its raw name, once", async () => {
	install();
	await world.toolCall("c", { tasks: [{ task: "level2 a", name: "Foo" }] });
	assert.equal((await world.spawn("Foo"))?.model, "@slow");
	assert.equal(await world.spawn("Foo"), undefined);
	assert.equal(await world.spawn("c:0"), undefined);
});

test("async mode: progress swaps the keys for the child id", async () => {
	install();
	await world.toolCall("c", {
		tasks: [{ task: "level2 a", name: "Foo" }, { task: "level0 b" }],
	});
	await world.update("c", [{ index: 0, id: "0-Foo", status: "running" }]);
	assert.equal(await world.spawn("Foo"), undefined);
	assert.equal((await world.spawn("0-Foo"))?.model, "@slow");
	await world.end("c", [{ index: 1, id: "1-Bar" }]);
	assert.equal((await world.spawn("1-Bar"))?.model, "@smol");
});

test("async mode: the id still works after the call ends, and the old keys do not", async () => {
	install();
	await world.toolCall("c", { tasks: [{ task: "level2 a", name: "Foo" }] });
	await world.update("c", [{ index: 0, id: "0-Foo" }]);
	await world.end("c");
	assert.equal(await world.spawn("c:0"), undefined);
	assert.equal((await world.spawn("0-Foo"))?.model, "@slow");
});

test("progress of another tool is ignored", async () => {
	install();
	await world.toolCall("c", { tasks: [{ task: "level2 a" }] });
	await world.handler("tool_execution_update")({
		toolName: "bash",
		toolCallId: "c",
		partialResult: { details: { progress: [{ index: 0, id: "x" }] } },
	});
	assert.equal(await world.spawn("x"), undefined);
	assert.equal((await world.spawn("c:0"))?.model, "@slow");
});

test("nested calls keep their own decisions", async () => {
	install();
	await world.toolCall("parent", { tasks: [{ task: "level0 a" }] });
	await world.toolCall("child", { tasks: [{ task: "level2 b" }] });
	await world.end("child");
	assert.equal(await world.spawn("child:0"), undefined);
	assert.equal((await world.spawn("parent:0"))?.model, "@smol");
});

test("one name in two open calls is ambiguous", async () => {
	install();
	await world.toolCall("parent", {
		tasks: [{ task: "level0 a", name: "Same" }],
	});
	await world.toolCall("child", {
		tasks: [{ task: "level2 b", name: "Same" }],
	});
	assert.equal(await world.spawn("Same"), undefined);
	assert.equal((await world.spawn("child:0"))?.model, "@slow");
});

test("a repeated name inside one call is skipped", async () => {
	install();
	await world.toolCall("c", {
		tasks: [
			{ task: "level0 a", name: "Same" },
			{ task: "level2 b", name: "Same" },
		],
	});
	assert.equal(await world.spawn("Same"), undefined);
});

test("a call whose spawn never came leaves nothing for a later same-name item", async () => {
	install();
	await world.toolCall("first", { tasks: [{ task: "level2 a", name: "Foo" }] });
	await world.end("first");
	world.credential = async () => undefined;
	await world.toolCall("second", {
		tasks: [{ task: "level2 b", name: "Foo" }],
	});
	world.credential = async () => "omp-key-0001";
	assert.equal(await world.spawn("Foo"), undefined);
});

test("an item the router could not score keeps a same-name sibling from taking its model", async () => {
	install();
	world.answer = async (sent) =>
		JSON.stringify(sent.body).includes("bad")
			? streamed(401, {})
			: streamed(200, {
					model: "jev",
					answers: {
						tier: { type: "score", probabilities: { 0: 0, 1: 0, 2: 1 } },
					},
				});
	await world.toolCall("c", {
		tasks: [
			{ task: "bad", name: "Same" },
			{ task: "good", name: "Same" },
		],
	});
	assert.equal(await world.spawn("Same"), undefined);
});

test("an eval spawn and another agent are skipped and keep the decision", async () => {
	install();
	await world.toolCall("c", { tasks: [{ task: "level2 a" }] });
	assert.equal(await world.spawn("c:0", { invocationKind: "eval" }), undefined);
	assert.equal(await world.spawn("c:0", { agent: "explore" }), undefined);
	assert.equal((await world.spawn("c:0"))?.model, "@slow");
});

test("a spawn that sets its own model role is left alone", async () => {
	install();
	await world.toolCall("c", { tasks: [{ task: "level2 a" }] });
	assert.equal(await world.spawn("c:0", { modelRole: "task" }), undefined);
});

test("a spawn without a key finds nothing", async () => {
	install();
	await world.toolCall("c", { tasks: [{ task: "level2 a" }] });
	assert.equal(await world.spawn(undefined), undefined);
});

test("level 1 returns nothing", async () => {
	install();
	await world.toolCall("c", { tasks: [{ task: "level1 a" }] });
	assert.equal(await world.spawn("c:0"), undefined);
});

test("a role that does not resolve is not returned", async () => {
	install();
	await twoTasks();
	world.resolvable.delete("@slow");
	assert.equal(await world.spawn("c:1"), undefined);
	assert.equal((await world.spawn("c:0"))?.model, "@smol");
});

for (const [name, close] of [
	["a task model role", () => (world.config.modelRoles = { task: "m" })],
	[
		"a disabled task agent",
		() => (world.config["task.disabledAgents"] = ["task"]),
	],
	["a custom task agent", () => (world.agents = [])],
	["a missing key", () => (world.credential = async () => undefined)],
] as const)
	test(`${name} at spawn time stops the decision`, async () => {
		install();
		await world.toolCall("c", { tasks: [{ task: "level2 a" }] });
		close();
		assert.equal(await world.spawn("c:0"), undefined);
	});

test("the store keeps 64 decisions and drops the oldest", async () => {
	install();
	for (let i = 0; i <= STORE_MAX; i++)
		await world.toolCall(`call${i}`, { tasks: [{ task: "level2 a" }] });
	assert.equal(await world.spawn("call0:0"), undefined);
	assert.equal((await world.spawn("call1:0"))?.model, "@slow");
	assert.equal((await world.spawn(`call${STORE_MAX}:0`))?.model, "@slow");
});

test("a failing handler leaves the task unrouted", async () => {
	install();
	const handler = world.handler("before_subagent_spawn");
	assert.equal(await handler(null, null), undefined);
	assert.equal(
		await handler({ agent: "task", invocationKind: "task" }, null),
		undefined,
	);
	await world.handler("tool_execution_update")(null);
});

const scoutBatch = async () => {
	world.project = { scope: "extended" };
	world.agents = [...AGENTS];
	install();
	await world.toolCall("c", {
		tasks: [
			{ task: "level2 a", agent: "scout" },
			{ task: "level2 b", agent: "helper" },
		],
	});
};
const scout = (extra: object = {}) =>
	world.spawn("c:0", { agent: "scout", ...extra });

test("a scout spawn with its own model role takes the slow role at level 2", async () => {
	await scoutBatch();
	assert.deepEqual(await scout({ modelRole: "smol" }), {
		model: "@slow",
		note: `model-router ${LINE}`,
	});
});

test("a scout spawn without a model role is routed too", async () => {
	await scoutBatch();
	assert.equal((await scout())?.model, "@slow");
});

test("a spawn whose model role differs from the agent's own is left alone", async () => {
	await scoutBatch();
	assert.equal(await scout({ modelRole: "slow" }), undefined);
});

test("an agent with no own role is left alone when its spawn carries a model role", async () => {
	await scoutBatch();
	assert.equal(
		await world.spawn("c:1", { agent: "helper", modelRole: "smol" }),
		undefined,
	);
});

test("an agent with no own role is routed when its spawn carries none", async () => {
	await scoutBatch();
	assert.equal((await world.spawn("c:1", { agent: "helper" }))?.model, "@slow");
});

test("a decision belongs to its agent: another agent takes nothing and leaves it", async () => {
	await scoutBatch();
	assert.equal(await world.spawn("c:0", { agent: "sonic" }), undefined);
	assert.equal(await world.spawn("c:0", { agent: "task" }), undefined);
	assert.equal((await scout({ modelRole: "smol" }))?.model, "@slow");
});

for (const [name, close] of [
	[
		"a model override",
		() => (world.config["task.agentModelOverrides"] = { scout: "m" }),
	],
	["a disabled agent", () => (world.config["task.disabledAgents"] = ["scout"])],
	["an agent gone from the list", () => (world.agents = [])],
	[
		"an agent that now sets its own model",
		() =>
			(world.agents = [{ name: "scout", source: "user", model: ["@smol"] }]),
	],
	["the core scope", () => (world.project = { scope: "core" })],
] as const)
	test(`${name} added before the spawn leaves it alone`, async () => {
		await scoutBatch();
		close();
		assert.equal(await scout({ modelRole: "smol" }), undefined);
	});
