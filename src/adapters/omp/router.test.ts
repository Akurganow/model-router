import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import {
	buildPrompt,
	DEFAULT_ROLE,
	NO_DESCRIPTION,
	roleText,
} from "../../core/brief.ts";
import { KEY_UNSET, UNREADABLE } from "../../core/reasons.ts";
import { tier } from "../../core/tier.ts";
import { work } from "../../core/work.ts";
import {
	ENDPOINT,
	jevAnswer,
	KEY,
	lockfileWith,
	OR_ENDPOINT,
	OR_KEY,
	setEnv,
	streamed,
	useWorld,
} from "./fakes.ts";
import { createExtension } from "./router.ts";

const world = useWorld();
afterEach(() => mock.timers.reset());
const install = () => createExtension(world.imports)(world.pi);
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

test("a request carries the tier and work questions, and the key goes in the header", async () => {
	install();
	await world.toolCall("c", { tasks: [{ task: "level0 Do it", name: "Foo" }] });
	assert.equal(world.sent.length, 1);
	assert.deepEqual(world.sent[0]?.body, {
		model: "jev-latest",
		state: {
			role: DEFAULT_ROLE,
			description: "Foo",
			task: "level0 Do it",
		},
		questions: { tier: tier.question, work: work.question },
	});
	assert.equal(world.sent[0]?.url, ENDPOINT);
	assert.equal(world.sent[0]?.authorization, `Bearer ${KEY}`);
});

test("the role is a user task agent's description, prepared as role text", async () => {
	const description = `  Plans\n the work with key sk-${"a".repeat(20)} ${"x".repeat(600)}`;
	world.project = { scope: "extended" };
	world.agents = [{ name: "task", source: "user", description }];
	install();
	await world.toolCall("c", { tasks: [{ task: "a" }, { task: "b" }] });
	const roles = world.sent.map(
		(s) => (s.body as { state: { role: string } }).state.role,
	);
	assert.deepEqual(roles, [roleText(description), roleText(description)]);
	assert.ok(!roles[0]?.includes("sk-"));
	assert.ok((roles[0]?.length ?? 0) <= 500);
});

for (const [name, agent] of [
	["no description", { name: "task", source: "user" }],
	["a blank description", { name: "task", source: "user", description: " " }],
] as const)
	test(`the user task agent with ${name} sends the neutral line`, async () => {
		world.project = { scope: "extended" };
		world.agents = [agent];
		install();
		await world.toolCall("c", { tasks: [{ task: "a" }] });
		const body = world.sent[0]?.body as { state: { role: string } };
		assert.equal(body.state.role, NO_DESCRIPTION);
	});

for (const [name, agent] of [
	[
		"a description",
		{ name: "task", source: "bundled", description: "Anything." },
	],
	["no description", { name: "task", source: "bundled" }],
] as const)
	test(`the bundled task agent with ${name} sends the default role`, async () => {
		world.agents = [agent];
		install();
		await world.toolCall("c", { tasks: [{ task: "a" }] });
		const body = world.sent[0]?.body as { state: { role: string } };
		assert.equal(body.state.role, DEFAULT_ROLE);
	});

// The key is joined at run time, so the owner-setup scan reads no key here.
test("an item's name is masked like the task text before it goes as the description", async () => {
	install();
	const key = ["sk", "a1B2c3D4e5F6g7H8"].join("-");
	await world.toolCall("c", {
		tasks: [{ task: "a", name: `Deploy with ${key}` }],
	});
	const body = world.sent[0]?.body as { state: { description: string } };
	assert.equal(body.state.description, "Deploy with ***");
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

test("a project narrowing auto sends the request to its provider with that provider's key", async () => {
	install();
	world.lockfile = lockfileWith("auto");
	world.project = { provider: "openrouter" };
	await world.toolCall("c", { tasks: [{ task: "level0 a" }] });
	assert.deepEqual(
		world.sent.map((s) => [s.url, s.authorization]),
		[[OR_ENDPOINT, `Bearer ${OR_KEY}`]],
	);
	assert.equal(
		world.notes[0],
		`${PREFIX}task 1: L0 @smol · high · p=0.90/0.90${SUFFIX}`,
	);
});

test("the setting is read for each batch, so a change needs no reload", async () => {
	install();
	await world.toolCall("c", { tasks: [{ task: "a" }] });
	world.lockfile = lockfileWith("openrouter");
	await world.toolCall("d", { tasks: [{ task: "a" }] });
	assert.deepEqual(
		world.sent.map((s) => s.url),
		[ENDPOINT, OR_ENDPOINT],
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
		`${PREFIX}task 1: L0 @smol · high · p=0.90/0.90${SUFFIX} | task 2: L1 no change · medium · p=0.90/0.90${SUFFIX} | task 3: L2 @slow · medium · p=0.90/0.90${SUFFIX}`,
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
	[KEY_UNSET, "key", () => (world.credential = async () => undefined)],
	[UNREADABLE, "settings", () => (world.lockfile = "{")],
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
			: streamed(200, jevAnswer(2, 1));
	await world.toolCall("c", { tasks: [{ task: "bad" }, { task: "good" }] });
	assert.equal(
		world.notes[0],
		`${PREFIX}task 1: skipped, HTTP 401 | task 2: L2 @slow · medium · p=0.90/0.90${SUFFIX}`,
	);
	assert.ok(!(world.notes[0] ?? "").includes(KEY));
});

test("a reply without the work answer is a bad reply", async () => {
	install();
	world.answer = async () => streamed(200, jevAnswer(0));
	await world.toolCall("c", { tasks: [{ task: "a" }] });
	assert.equal(world.notes[0], `${PREFIX}task 1: skipped, bad reply`);
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
	assert.equal((await world.spawn("c:0"))?.model, "@slow:medium");
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
		return streamed(200, jevAnswer(1, 1));
	};
	const tasks = Array.from({ length: 10 }, (_, i) => ({ task: `task ${i}` }));
	await world.toolCall("c", { tasks });
	assert.equal(peak, 4);
	assert.equal(world.sent.length, 10);
	assert.equal(world.notes.length, 1);
});

const VIA = " · via openrouter (typesafe HTTP 503)";
const entriesOf = (note: string | undefined) =>
	(note ?? "").slice(PREFIX.length).split(" | ");
const count = (url: string) => world.sent.filter((s) => s.url === url).length;

test("in an outage, items that start later in the batch pass over the failed provider", async () => {
	install();
	world.lockfile = lockfileWith("auto");
	world.answer = async ({ url }) =>
		url === ENDPOINT
			? streamed(503, { error: "down" })
			: streamed(200, jevAnswer(1, 1));
	const tasks = Array.from({ length: 6 }, (_, i) => ({ task: `task ${i}` }));
	await world.toolCall("c", { tasks });
	assert.equal(count(ENDPOINT), 4);
	assert.equal(count(OR_ENDPOINT), 6);
	const line = `L1 no change · medium · p=0.90/0.90${SUFFIX}`;
	assert.deepEqual(entriesOf(world.notes[0]), [
		...[1, 2, 3, 4].map((n) => `task ${n}: ${line}${VIA}`),
		`task 5: ${line}`,
		`task 6: ${line}`,
	]);
	await world.toolCall("d", { tasks: [{ task: "a" }] });
	assert.equal(count(ENDPOINT), 5);
});

test("an item that starts while another waits on its fallback already passes over the failed provider", async () => {
	install();
	world.lockfile = lockfileWith("auto");
	let fellBack = () => {};
	const fallbackSent = new Promise<void>((resolve) => {
		fellBack = resolve;
	});
	let lastStarted = () => {};
	const lastSent = new Promise<void>((resolve) => {
		lastStarted = resolve;
	});
	world.answer = async ({ url, body }) => {
		const { task } = (body as { state: { task: string } }).state;
		if (task.startsWith("task 4")) lastStarted();
		if (task.startsWith("task 0")) {
			if (url === ENDPOINT) return streamed(503, { error: "down" });
			fellBack();
			await lastSent;
		} else if (url === ENDPOINT) await fallbackSent;
		return streamed(200, jevAnswer(1, 1));
	};
	const tasks = Array.from({ length: 5 }, (_, i) => ({ task: `task ${i}` }));
	await world.toolCall("c", { tasks });
	assert.equal(count(ENDPOINT), 4);
	assert.equal(count(OR_ENDPOINT), 2);
	const line = `L1 no change · medium · p=0.90/0.90${SUFFIX}`;
	assert.deepEqual(entriesOf(world.notes[0]), [
		`task 1: ${line}${VIA}`,
		...[2, 3, 4, 5].map((n) => `task ${n}: ${line}`),
	]);
});

test("a skip after two attempts names both providers, a later one-attempt skip does not", async () => {
	install();
	world.lockfile = lockfileWith("auto");
	world.answer = async ({ url }) =>
		streamed(url === ENDPOINT ? 503 : 401, { error: "no" });
	const tasks = Array.from({ length: 5 }, (_, i) => ({ task: `task ${i}` }));
	await world.toolCall("c", { tasks });
	assert.deepEqual(entriesOf(world.notes[0]), [
		...[1, 2, 3, 4].map(
			(n) => `task ${n}: skipped, typesafe HTTP 503, openrouter HTTP 401`,
		),
		"task 5: skipped, HTTP 401",
	]);
});

test("one 8 s limit covers the batch: running and queued items are skipped as timeout", async () => {
	install();
	mock.timers.enable({ apis: ["setTimeout", "Date"] });
	world.answer = (_sent, _n, signal) =>
		new Promise((_resolve, reject) =>
			signal.addEventListener("abort", () => reject(signal.reason)),
		);
	const tasks = Array.from({ length: 6 }, (_, i) => ({ task: `task ${i}` }));
	const pending = world.toolCall("c", { tasks });
	// The settings read is real file I/O, so the limit starts once the first requests are out.
	while (world.sent.length < 4)
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

const TIMEOUT = "extensionHandlers.toolCallTimeoutMs";
const flush = () => new Promise((resolve) => setImmediate(resolve));

// The key lookup takes the given time on the mocked clock.
const slowKey = (ms: number) => {
	world.credential = (provider) =>
		new Promise((resolve) =>
			setTimeout(() => resolve(provider === "typesafe" ? KEY : undefined), ms),
		);
};
const passKey = async (ms: number) => {
	while (world.asked.length === 0) await flush();
	mock.timers.tick(ms);
};
const hangingAnswer = () => {
	world.answer = (_sent, _n, signal) =>
		new Promise((_resolve, reject) =>
			signal.addEventListener("abort", () => reject(signal.reason)),
		);
};

test("gates that use up the deadline leave nothing to send, and the item skips as timeout", async () => {
	world.config[TIMEOUT] = 3000;
	install();
	mock.timers.enable({ apis: ["setTimeout", "Date"] });
	slowKey(2500);
	hangingAnswer();
	const pending = world.toolCall("c", { tasks: [{ task: "level2 a" }] });
	await passKey(2500);
	while (world.notes.length === 0 && world.sent.length === 0) await flush();
	assert.deepEqual(world.sent, []);
	assert.deepEqual(world.notes, [`${PREFIX}task 1: skipped, timeout`]);
	await pending;
});

test("the gates' time counts against the deadline: scoring gets only what is left", async () => {
	world.config[TIMEOUT] = 4000;
	install();
	mock.timers.enable({ apis: ["setTimeout", "Date"] });
	slowKey(500);
	hangingAnswer();
	const pending = world.toolCall("c", { tasks: [{ task: "level2 a" }] });
	await passKey(500);
	while (world.sent.length < 1) await flush();
	mock.timers.tick(1499);
	await flush();
	assert.equal(world.notes.length, 0);
	mock.timers.tick(1);
	await pending;
	assert.deepEqual(world.notes, [`${PREFIX}task 1: skipped, timeout`]);
});

test("a tool call timeout under 3 s skips every item, reads no key and sends nothing", async () => {
	world.config[TIMEOUT] = 2500;
	install();
	const result = await world.toolCall("c", {
		tasks: [{ task: "level2 a" }, { task: "level0 b" }],
	});
	assert.equal(result, undefined);
	const reason = "skipped, tool call timeout 2500 ms leaves 500 ms to route";
	assert.deepEqual(world.notes, [
		`${PREFIX}task 1: ${reason} | task 2: ${reason}`,
	]);
	assert.deepEqual(world.sent, []);
	assert.deepEqual(world.asked, []);
});

test("a tool call timeout of 3 s still routes", async () => {
	world.config[TIMEOUT] = 3000;
	install();
	await world.toolCall("c", { tasks: [{ task: "level2 a" }] });
	assert.equal(world.sent.length, 1);
	assert.deepEqual(world.notes, [
		`${PREFIX}task 1: L2 @slow · medium · p=0.90/0.90${SUFFIX}`,
	]);
});

for (const [timeout, limit] of [
	[4000, 2000],
	[9000, 7000],
	[60000, 8000],
	["x", 8000],
] as const)
	test(`a tool call timeout of ${timeout} gives the batch ${limit} ms`, async () => {
		world.config[TIMEOUT] = timeout;
		install();
		mock.timers.enable({ apis: ["setTimeout", "Date"] });
		world.answer = (_sent, _n, signal) =>
			new Promise((_resolve, reject) =>
				signal.addEventListener("abort", () => reject(signal.reason)),
			);
		const pending = world.toolCall("c", { tasks: [{ task: "level2 a" }] });
		while (world.sent.length < 1)
			await new Promise((resolve) => setImmediate(resolve));
		mock.timers.tick(limit - 1);
		await new Promise((resolve) => setImmediate(resolve));
		assert.equal(world.notes.length, 0);
		mock.timers.tick(1);
		await pending;
		assert.deepEqual(world.notes, [`${PREFIX}task 1: skipped, timeout`]);
	});
