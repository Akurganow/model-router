import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { buildPrompt } from "./brief.ts";
import { tier } from "./model.ts";
import {
	ENDPOINT,
	jevAnswer,
	KEY,
	setEnv,
	streamed,
	useWorld,
} from "./omp-fakes.ts";
import { createExtension } from "./omp-router.ts";

const world = useWorld();
afterEach(() => mock.timers.reset());
const install = () => createExtension(world.lookup)(world.pi);
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const PREFIX = "model-router ";
const SUFFIX = " · jev jev-1.14.0 · 812/9 tok";

test("the factory registers the four handlers", () => {
	install();
	assert.deepEqual(Object.keys(world.handlers).sort(), [
		"before_subagent_spawn",
		"tool_call",
		"tool_execution_end",
		"tool_execution_update",
	]);
});

test("a request carries the tier question only, and the key goes in the header", async () => {
	install();
	await world.toolCall("c", { tasks: [{ task: "level0 Do it", name: "Foo" }] });
	assert.equal(world.sent.length, 1);
	assert.deepEqual(world.sent[0]?.body, {
		model: "jev-latest",
		state: {
			role: "general-purpose",
			description: "Foo",
			task: "level0 Do it",
		},
		questions: { tier: tier.question },
	});
	assert.equal(world.sent[0]?.url, ENDPOINT);
	assert.equal(world.sent[0]?.authorization, `Bearer ${KEY}`);
});

test("an unnamed item has an empty description, and the batch context follows the task", async () => {
	install();
	await world.toolCall("c", {
		context: "Shared notes",
		tasks: [{ task: "a" }],
	});
	const body = world.sent[0]?.body as {
		state: { description: string; task: string };
	};
	assert.equal(body.state.description, "");
	assert.equal(body.state.task, buildPrompt("a", "Shared notes"));
});

test("the environment cannot move the request", async () => {
	setEnv("TYPESAFE_BASE_URL", "https://example.invalid/v1");
	try {
		install();
		await world.toolCall("c", { tasks: [{ task: "a" }] });
	} finally {
		setEnv("TYPESAFE_BASE_URL", undefined);
	}
	assert.deepEqual(
		world.sent.map((s) => s.url),
		[ENDPOINT],
	);
});

test("the input is never changed and the handler returns nothing", async () => {
	install();
	const input = { context: "c", tasks: [{ task: "level2 a", name: "n" }] };
	const before = structuredClone(input);
	assert.equal(await world.toolCall("c", input), undefined);
	assert.deepEqual(input, before);
});

test("the batch makes one line with one entry per scored item", async () => {
	install();
	await world.toolCall("c", {
		tasks: [
			{ task: "level0 a" },
			{ task: "level1 b", agent: "task" },
			{ task: "level2 c" },
		],
	});
	assert.deepEqual(world.notes, [
		`${PREFIX}task 1: L0 @smol · p=0.90${SUFFIX} | task 2: L1 no change · p=0.90${SUFFIX} | task 3: L2 @slow · p=0.90${SUFFIX}`,
	]);
});

test("only items for the task agent with a task text are scored, numbered by position", async () => {
	install();
	await world.toolCall("c", {
		tasks: [
			{ task: "x", agent: "explore" },
			{ task: 42 },
			{ task: "" },
			{ agent: "task" },
			"text",
			null,
			{ task: "level2 a" },
		],
	});
	assert.equal(world.sent.length, 1);
	assert.match(world.notes[0] ?? "", /^model-router task 7: L2 @slow /);
});

test("other tools, other shapes and nothing eligible send and say nothing", async () => {
	install();
	await world.toolCall("c", { tasks: [{ task: "a" }] }, "bash");
	for (const input of [
		undefined,
		null,
		{},
		{ tasks: [] },
		{ tasks: "do it" },
		{ tasks: [{ task: "x", agent: "explore" }] },
	])
		await world.toolCall("c", input);
	assert.equal(world.sent.length, 0);
	assert.equal(world.notes.length, 0);
	assert.equal(world.stderr.length, 0);
});

const closed: [string, string, () => void][] = [
	["key unset", "key", () => (world.credential = async () => undefined)],
	[
		"task model role set",
		"role",
		() => (world.config.modelRoles = { task: "m" }),
	],
	[
		"task model override set",
		"override",
		() => (world.config["task.agentModelOverrides"] = { task: "m" }),
	],
	[
		"task agent disabled",
		"disabled",
		() => (world.config["task.disabledAgents"] = ["task"]),
	],
	["custom task agent", "agent", () => (world.agents = [])],
	["no @smol or @slow model", "models", () => world.resolvable.clear()],
];
for (const [reason, name, close] of closed)
	test(`a closed ${name} gate sends nothing and the line names the reason`, async () => {
		install();
		close();
		await world.toolCall("c", { tasks: [{ task: "a" }, { task: "b" }] });
		assert.equal(world.sent.length, 0);
		assert.deepEqual(world.notes, [
			`${PREFIX}task 1: skipped, ${reason} | task 2: skipped, ${reason}`,
		]);
	});

test("a closed gate stores nothing for the spawn", async () => {
	install();
	world.config.modelRoles = { task: "m" };
	await world.toolCall("c", { tasks: [{ task: "level2 a" }] });
	world.config.modelRoles = {};
	assert.equal(await world.spawn("c:0"), undefined);
});

test("an item the request cannot score is skipped with its category", async () => {
	install();
	world.answer = async (sent) =>
		JSON.stringify(sent.body).includes("bad")
			? streamed(401, { error: "no" })
			: streamed(200, jevAnswer(2));
	await world.toolCall("c", { tasks: [{ task: "bad" }, { task: "good" }] });
	assert.equal(
		world.notes[0],
		`${PREFIX}task 1: skipped, HTTP 401 | task 2: L2 @slow · p=0.90${SUFFIX}`,
	);
	assert.ok(!(world.notes[0] ?? "").includes(KEY));
});

test("a reply without the tier answer is a bad reply", async () => {
	install();
	world.answer = async () => streamed(200, { model: "jev", answers: {} });
	await world.toolCall("c", { tasks: [{ task: "a" }] });
	assert.equal(world.notes[0], `${PREFIX}task 1: skipped, bad reply`);
});

test("without a UI the line goes to standard error", async () => {
	install();
	world.hasUI = false;
	await world.toolCall("c", { tasks: [{ task: "level0 a" }] });
	assert.equal(world.notes.length, 0);
	assert.equal(world.stderr.length, 1);
	assert.match(world.stderr[0] ?? "", /^model-router task 1: L0 @smol .*\n$/);
});

test("a throwing notification does not reach omp, and the decision still waits for its spawn", async () => {
	install();
	const ctx = {
		cwd: "/work",
		hasUI: true,
		ui: {
			notify: () => {
				throw new Error("ui gone");
			},
		},
		modelRegistry: { getApiKeyForProvider: async () => KEY },
		models: { resolve: () => ({}) },
	};
	const handler = world.handler("tool_call");
	const event = {
		toolName: "task",
		toolCallId: "c",
		input: { tasks: [{ task: "level2 a" }] },
	};
	assert.equal(await handler(event, ctx), undefined);
	assert.equal((await world.spawn("c:0"))?.model, "@slow");
});

test("a hostile event does not throw", async () => {
	install();
	const handler = world.handler("tool_call");
	const hostile = { toolName: "task", toolCallId: "c" };
	Object.defineProperty(hostile, "input", {
		get() {
			throw new Error("no input");
		},
	});
	for (const event of [hostile, null, undefined])
		assert.equal(await handler(event, null), undefined);
	assert.equal(world.sent.length, 0);
});

test("at most four items are scored at once", async () => {
	install();
	let inFlight = 0;
	let peak = 0;
	world.answer = async () => {
		inFlight += 1;
		peak = Math.max(peak, inFlight);
		await wait(15);
		inFlight -= 1;
		return streamed(200, jevAnswer(1));
	};
	const tasks = Array.from({ length: 10 }, (_, i) => ({ task: `task ${i}` }));
	await world.toolCall("c", { tasks });
	assert.equal(peak, 4);
	assert.equal(world.sent.length, 10);
	assert.equal(world.notes.length, 1);
});

test("one 8 s limit covers the batch: running and queued items are skipped as timeout", async () => {
	install();
	mock.timers.enable({ apis: ["setTimeout"] });
	world.answer = (_sent, _n, signal) =>
		new Promise((_resolve, reject) =>
			signal.addEventListener("abort", () => reject(signal.reason)),
		);
	const tasks = Array.from({ length: 6 }, (_, i) => ({ task: `task ${i}` }));
	const pending = world.toolCall("c", { tasks });
	await new Promise((resolve) => setImmediate(resolve));
	mock.timers.tick(7999);
	await new Promise((resolve) => setImmediate(resolve));
	assert.equal(world.notes.length, 0);
	mock.timers.tick(1);
	await pending;
	const entries = (world.notes[0] ?? "").slice(PREFIX.length).split(" | ");
	assert.equal(entries.length, 6);
	for (const [i, entry] of entries.entries())
		assert.equal(entry, `task ${i + 1}: skipped, timeout`);
	assert.equal(world.sent.length, 4);
});
