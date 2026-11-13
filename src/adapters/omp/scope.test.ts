import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_ROLE, roleText } from "../../core/brief.ts";
import { skippedLine } from "../../core/line.ts";
import {
	agentDiscoveryFailed,
	agentUnknown,
	KEY_UNSET,
	setsOwnModel,
	UNREADABLE,
} from "../../core/reasons.ts";
import { AGENTS, extend } from "./fake-agents.ts";
import { lockfileScoped, throws, useWorld } from "./fakes.ts";
import { createExtension } from "./router.ts";

const world = useWorld();
const PREFIX = "model-router ";
const install = () => createExtension(world.imports)(world.pi);
const entriesOf = () =>
	(world.notes[0] ?? "").slice(PREFIX.length).split(" | ");
const heads = () => entriesOf().map((entry) => entry.replace(/ · .*/, ""));
const BATCH = { tasks: [{ task: "a", agent: "scout" }, { task: "b" }] };
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
	extend(world);
	install();
	const tasks = ROUTED.map((agent) => ({ task: `level2 ${agent}`, agent }));
	await world.toolCall("c", { tasks });
	assert.equal(world.sent.length, ROUTED.length);
	assert.deepEqual(
		heads(),
		ROUTED.map((_, i) => `task ${i + 1}: L2 @slow`),
	);
});

test("extended: seance is skipped with its own reason and the rest are scored", async () => {
	extend(world);
	install();
	await world.toolCall("c", {
		tasks: [
			{ task: "level2 a", agent: "seance" },
			{ task: "level2 b", agent: "scout" },
		],
	});
	assert.equal(world.sent.length, 1);
	assert.deepEqual(heads(), [
		"task 1: skipped, seance spawns without the hook omp gives plugins, so its model cannot change",
		"task 2: L2 @slow",
	]);
});

test("extended: each item sends its own agent's description, and the task agent the default role", async () => {
	extend(world);
	install();
	const named = ROUTED.map((agent) => ({ task: `a ${agent}`, agent }));
	await world.toolCall("c", { tasks: [...named, { task: "no agent" }] });
	for (const { task, agent } of named)
		assert.equal(
			roleSentFor(task),
			agent === "task"
				? DEFAULT_ROLE
				: roleText(world.agents.find((a) => a.name === agent)?.description),
			agent,
		);
	assert.equal(roleSentFor("no agent"), DEFAULT_ROLE);
});

test("extended: each skipped item names its reason and the rest are still scored", async () => {
	extend(world);
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
	assert.deepEqual(heads(), [
		`task 1: ${skippedLine(setsOwnModel("pinned"))}`,
		"task 2: skipped, sonic model override set",
		"task 3: skipped, seance agent disabled",
		`task 4: ${skippedLine(agentUnknown("ghost"))}`,
		"task 5: L2 @slow",
	]);
});

test("extended: a task model role skips the task item alone", async () => {
	extend(world);
	world.config.modelRoles = {
		task: "m",
		smol: "prov/small",
		slow: "prov/large",
	};
	install();
	await world.toolCall("c", {
		tasks: [{ task: "level2 a" }, { task: "level2 b", agent: "scout" }],
	});
	assert.match(entriesOf()[0] ?? "", /^task 1: skipped, task model role set$/);
	assert.match(entriesOf()[1] ?? "", /^task 2: L2 @slow /);
});

test("extended: a failed discovery skips every item with its reason", async () => {
	extend(world);
	const broken = {
		...world.pi,
		pi: {
			...world.pi.pi,
			discoverAgents: async () => throws(),
		},
	};
	createExtension(world.imports)(broken);
	await world.toolCall("c", BATCH);
	assert.equal(world.sent.length, 0);
	assert.deepEqual(entriesOf(), [
		`task 1: ${skippedLine(agentDiscoveryFailed("scout"))}`,
		`task 2: ${skippedLine(agentDiscoveryFailed("task"))}`,
	]);
});

test("extended: a batch gate closes every item", async () => {
	extend(world);
	world.credential = async () => undefined;
	install();
	await world.toolCall("c", BATCH);
	assert.deepEqual(entriesOf(), [
		`task 1: ${skippedLine(KEY_UNSET)}`,
		`task 2: ${skippedLine(KEY_UNSET)}`,
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

const scoutAlone = async () => {
	world.agents = [...AGENTS];
	install();
	await world.toolCall("c", { tasks: [{ task: "a", agent: "scout" }] });
};

test("a global extended scope routes other agents", async () => {
	world.lockfile = lockfileScoped("extended");
	await scoutAlone();
	assert.equal(world.sent.length, 1);
});

test("a project core scope overrides a global extended one", async () => {
	world.lockfile = lockfileScoped("extended");
	world.project = { scope: "core" };
	await scoutAlone();
	assert.equal(world.sent.length, 0);
	assert.equal(world.notes.length, 0);
});

test("a project extended scope overrides a global core one", async () => {
	world.lockfile = lockfileScoped("core");
	world.project = { scope: "extended" };
	await scoutAlone();
	assert.equal(world.sent.length, 1);
});

test("unreadable settings close the batch for the task items and drop the rest", async () => {
	world.lockfile = "{";
	install();
	await world.toolCall("c", BATCH);
	assert.equal(world.sent.length, 0);
	assert.deepEqual(entriesOf(), [`task 2: ${skippedLine(UNREADABLE)}`]);
});

test("an agent that is not a string is not eligible", async () => {
	extend(world);
	install();
	await world.toolCall("c", { tasks: [{ task: "a", agent: 7 }] });
	assert.equal(world.sent.length, 0);
	assert.equal(world.notes.length, 0);
});
