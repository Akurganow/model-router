import assert from "node:assert/strict";
import { test } from "node:test";
import { roleText } from "./brief.ts";
import { AGENTS } from "./omp-fake-agents.ts";
import { lockfileScoped, useWorld } from "./omp-fakes.ts";
import { createExtension } from "./omp-router.ts";

const world = useWorld();
const PREFIX = "model-router ";
const install = () => createExtension(world.imports)(world.pi);
const extend = () => {
	world.project = { scope: "extended" };
	world.agents = [...AGENTS, { name: "constructor", source: "user" }];
};
const entriesOf = () =>
	(world.notes[0] ?? "").slice(PREFIX.length).split(" | ");
const roleSentFor = (task: string) =>
	(
		world.sent.find(
			(s) => (s.body as { state: { task: string } }).state.task === task,
		)?.body as { state: { role: string } }
	)?.state.role;

const ROUTED = [
	"task",
	"scout",
	"sonic",
	"reviewer",
	"security-reviewer",
	"helper",
	"constructor",
];

test("extended: every bundled agent and a user agent without a model are scored", async () => {
	extend();
	install();
	const tasks = ROUTED.map((agent) => ({ task: `level2 ${agent}`, agent }));
	await world.toolCall("c", { tasks });
	assert.equal(world.sent.length, ROUTED.length);
	assert.deepEqual(
		entriesOf().map((entry) => entry.replace(/ · .*/, "")),
		ROUTED.map((_, i) => `task ${i + 1}: L2 @slow`),
	);
});

test("extended: seance is skipped with its own reason and the rest are scored", async () => {
	extend();
	install();
	await world.toolCall("c", {
		tasks: [
			{ task: "level2 a", agent: "seance" },
			{ task: "level2 b", agent: "scout" },
		],
	});
	assert.equal(world.sent.length, 1);
	assert.deepEqual(
		entriesOf().map((entry) => entry.replace(/ · .*/, "")),
		[
			"task 1: skipped, seance spawns without the hook omp gives plugins, so its model cannot change",
			"task 2: L2 @slow",
		],
	);
});

test("extended: each item sends the description of its own agent as the role", async () => {
	extend();
	install();
	const named = ROUTED.map((agent) => ({ task: `a ${agent}`, agent }));
	await world.toolCall("c", { tasks: [...named, { task: "no agent" }] });
	for (const { task, agent } of named)
		assert.equal(
			roleSentFor(task),
			roleText(world.agents.find((a) => a.name === agent)?.description),
			agent,
		);
	assert.equal(roleSentFor("no agent"), roleText(AGENTS[0]?.description));
});

test("extended: each skipped item names its reason and the rest are still scored", async () => {
	extend();
	world.config["task.agentModelOverrides"] = { sonic: "m" };
	world.config["task.disabledAgents"] = ["seance"];
	install();
	await world.toolCall("c", {
		tasks: [
			{ task: "level2 a", agent: "pinned" },
			{ task: "level2 b", agent: "sonic" },
			{ task: "level2 c", agent: "seance" },
			{ task: "level2 d", agent: "ghost" },
			{ task: "level2 e", agent: "scout" },
		],
	});
	assert.equal(world.sent.length, 1);
	assert.deepEqual(
		entriesOf().map((entry) => entry.replace(/ · .*/, "")),
		[
			"task 1: skipped, pinned sets its own model",
			"task 2: skipped, sonic model override set",
			"task 3: skipped, seance agent disabled",
			"task 4: skipped, ghost agent unknown",
			"task 5: L2 @slow",
		],
	);
});

test("extended: a task model role skips the task item alone", async () => {
	extend();
	world.config.modelRoles = { task: "m" };
	install();
	await world.toolCall("c", {
		tasks: [{ task: "level2 a" }, { task: "level2 b", agent: "scout" }],
	});
	assert.match(entriesOf()[0] ?? "", /^task 1: skipped, task model role set$/);
	assert.match(entriesOf()[1] ?? "", /^task 2: L2 @slow /);
});

test("extended: a failed discovery skips every item with its reason", async () => {
	extend();
	const broken = {
		...world.pi,
		pi: {
			...world.pi.pi,
			discoverAgents: async () => {
				throw new Error("boom");
			},
		},
	};
	createExtension(world.imports)(broken);
	await world.toolCall("c", {
		tasks: [{ task: "a", agent: "scout" }, { task: "b" }],
	});
	assert.equal(world.sent.length, 0);
	assert.deepEqual(entriesOf(), [
		"task 1: skipped, scout agent discovery failed",
		"task 2: skipped, task agent discovery failed",
	]);
});

test("extended: a batch gate closes every item", async () => {
	extend();
	world.credential = async () => undefined;
	install();
	await world.toolCall("c", {
		tasks: [{ task: "a", agent: "scout" }, { task: "b" }],
	});
	assert.deepEqual(entriesOf(), [
		"task 1: skipped, key unset",
		"task 2: skipped, key unset",
	]);
});

test("core: another agent is dropped without a word, with or without a task item beside it", async () => {
	world.agents = [...AGENTS];
	install();
	await world.toolCall("c", {
		tasks: [{ task: "level2 a", agent: "scout" }, { task: "level2 b" }],
	});
	assert.equal(world.sent.length, 1);
	assert.match(world.notes[0] ?? "", /^model-router task 2: L2 @slow /);
});

test("a global extended scope routes other agents", async () => {
	world.lockfile = lockfileScoped("extended");
	world.agents = [...AGENTS];
	install();
	await world.toolCall("c", { tasks: [{ task: "a", agent: "scout" }] });
	assert.equal(world.sent.length, 1);
});

test("a project core scope overrides a global extended one", async () => {
	world.lockfile = lockfileScoped("extended");
	world.project = { scope: "core" };
	world.agents = [...AGENTS];
	install();
	await world.toolCall("c", { tasks: [{ task: "a", agent: "scout" }] });
	assert.equal(world.sent.length, 0);
	assert.equal(world.notes.length, 0);
});

test("a project extended scope overrides a global core one", async () => {
	world.lockfile = lockfileScoped("core");
	world.project = { scope: "extended" };
	world.agents = [...AGENTS];
	install();
	await world.toolCall("c", { tasks: [{ task: "a", agent: "scout" }] });
	assert.equal(world.sent.length, 1);
});

test("unreadable settings close the batch for the task items and drop the rest", async () => {
	world.lockfile = "{";
	install();
	await world.toolCall("c", {
		tasks: [{ task: "a", agent: "scout" }, { task: "b" }],
	});
	assert.equal(world.sent.length, 0);
	assert.deepEqual(entriesOf(), ["task 2: skipped, settings unreadable"]);
});

test("an agent that is not a string is not eligible", async () => {
	extend();
	install();
	await world.toolCall("c", { tasks: [{ task: "a", agent: 7 }] });
	assert.equal(world.sent.length, 0);
	assert.equal(world.notes.length, 0);
});
