import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_ROLE, NO_DESCRIPTION, roleText } from "./brief.ts";
import {
	AGENT_CALL,
	ANSWER,
	CLOCK,
	nextHook,
	registered,
	routedCall,
	SPAWN,
} from "./claude-fakes.ts";
import { EFFORTS_MAX } from "./claude-host.ts";
import { skippedLine } from "./line.ts";
import { KEY_UNSET } from "./settings.ts";

test("a new registration forgets the offers made before it", async () => {
	const logs: string[] = [];
	const $ = {
		clock: CLOCK,
		env: { get: async () => undefined },
		tool: { check: async () => ({ decision: "allow" }) },
		ui: { log: async (text: string) => logs.push(text) },
	};
	const next = nextHook();
	const call = SPAWN;

	await registered()["agent.offer"]?.(
		$,
		{ agent: "general-purpose", source: "built-in" },
		next,
	);
	const fresh = registered();
	await fresh[AGENT_CALL]?.($, call, next);
	assert.deepEqual(logs, []);

	await fresh["agent.offer"]?.(
		$,
		{ agent: "general-purpose", source: "built-in" },
		next,
	);
	await fresh[AGENT_CALL]?.($, call, next);
	assert.deepEqual(logs, [skippedLine(KEY_UNSET)]);
});

test("an unknown provider value routes as typesafe and reads no OpenRouter key", async () => {
	const { reads, requests } = await routedCall(
		{ provider: "bogus", api_key: "", openrouter_api_key: "or-key" },
		{ TYPESAFE_API_KEY: "ts-key", OPENROUTER_API_KEY: "or-var-key" },
	);
	assert.deepEqual(reads, ["TYPESAFE_API_KEY", "CLAUDE_CODE_EFFORT_LEVEL"]);
	assert.deepEqual(requests, [
		{ url: "https://api.typesafe.ai/v1/systemone", model: "jev-latest" },
	]);
});

test("a stored model option is ignored and jev-latest is sent", async () => {
	const { requests } = await routedCall(
		{ api_key: "ts-key", model: "jev-preview" },
		{},
	);
	assert.deepEqual(
		requests.map((r) => r.model),
		["jev-latest"],
	);
});

test("under extended a fresh registration with no offers sends the default role", async () => {
	const { requests, roles } = await routedCall(
		{ api_key: "ts-key", scope: "extended" },
		{},
		[],
	);
	assert.equal(requests.length, 1);
	assert.deepEqual(roles, [DEFAULT_ROLE]);
});

test("under core a fresh registration with no offers sends no request", async () => {
	const { requests } = await routedCall({ api_key: "ts-key" }, {}, []);
	assert.deepEqual(requests, []);
});

test("a built-in claude agent sends the default role whatever description Claude Code offers", async () => {
	const { roles } = await routedCall(
		{ api_key: "ts-key" },
		{},
		[
			{
				agent: "claude",
				source: "built-in",
				description:
					"Catch-all agent for any task that fits no more specific agent.",
			},
		],
		"claude",
	);
	assert.deepEqual(roles, [DEFAULT_ROLE]);
});

for (const agent of ["general-purpose", "claude"])
	test(`under extended a user agent that takes the name ${agent} sends its own description`, async () => {
		const { roles } = await routedCall(
			{ api_key: "ts-key", scope: "extended" },
			{},
			[{ agent, source: "user", description: "Mine." }],
			agent,
		);
		assert.deepEqual(roles, [roleText("Mine.")]);
	});

test("under extended an Explore agent with no offer sends the neutral line", async () => {
	const { roles } = await routedCall(
		{ api_key: "ts-key", scope: "extended" },
		{},
		[],
		"Explore",
	);
	assert.deepEqual(roles, [NO_DESCRIPTION]);
});

test("a built-in Explore agent keeps its offered description", async () => {
	const { roles } = await routedCall(
		{ api_key: "ts-key" },
		{},
		[
			{
				agent: "Explore",
				source: "built-in",
				description: "Searches the code.",
			},
		],
		"Explore",
	);
	assert.deepEqual(roles, [roleText("Searches the code.")]);
});

test("register hooks the offers, the spawn, the steps, the turn ends, the session start, the config tool and both commands by literal matcher", () => {
	assert.deepEqual(Object.keys(registered()).sort(), [
		"agent.offer",
		"agent.spawn",
		'command.run {"command":"model-router:provider"}',
		'command.run {"command":"model-router:scope"}',
		"session.start",
		'tool.call {"tool":"Agent"}',
		'tool.call {"tool":"mcp__model-router__config"}',
		"turn.complete",
		"turn.step",
	]);
});

const SPAWN_HOOK = "agent.spawn";
const flush = async () => {
	for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
};

// A session with a key and a built-in general-purpose offer. Its clock sleeps until a test wakes them.
async function session() {
	const hooks = registered({ api_key: "ts-key" });
	const logs: string[] = [];
	const sleeps: { ms: number; wake(): void }[] = [];
	const fetched: string[] = [];
	const $ = {
		clock: {
			after: () => ({ cancel() {} }),
			sleep: (ms: number, { signal }: { signal: AbortSignal }) =>
				new Promise<void>((resolve, reject) => {
					sleeps.push({ ms, wake: resolve });
					signal.addEventListener("abort", () => reject(signal.reason));
				}),
		},
		env: { get: async () => undefined },
		http: {
			fetch: async (url: string) => {
				fetched.push(url);
				return { status: 200, ok: true, headers: {}, text: ANSWER };
			},
		},
		tool: { check: async () => ({ decision: "allow" }) },
		ui: { log: async (text: string) => logs.push(text) },
	};
	await hooks["agent.offer"]?.(
		$,
		{ agent: "general-purpose", source: "built-in", description: "" },
		nextHook(),
	);
	// Runs the spawn with `started` as the engine beneath it, from the plugin named `plugin`.
	const spawn = (started: () => Promise<unknown>, plugin = "engine") =>
		hooks[SPAWN_HOOK]?.(
			$,
			SPAWN,
			Object.assign(started, {
				signal: new AbortController().signal,
				origin: { plugin },
			}),
		);
	// Runs a request of `agentId` and returns the effort that reached the engine.
	const step = async (agentId: string) => {
		const seen: { effort?: string }[] = [];
		const stream = (hooks["turn.step"] as unknown as StepHook)(
			$,
			{ agentId, effort: "max" },
			// biome-ignore lint/correctness/useYield: the bottom of the chain streams no chunks
			async function* (e) {
				seen.push(e);
				return {};
			},
		);
		for await (const _ of stream);
		return seen[0]?.effort;
	};
	const complete = (agentId: string) =>
		hooks["turn.complete"]?.($, { agentId }, nextHook());
	return { $, hooks, logs, sleeps, fetched, spawn, step, complete };
}

type StepHook = (
	$: unknown,
	e: { agentId: string; effort: string },
	next: (e: { effort?: string }) => AsyncGenerator<never, unknown>,
) => AsyncGenerator<never, unknown>;

const STARTED = async () => ({ agentId: "agent-1", model: "haiku" });

test("a step from an agent no routed spawn is waiting for does not wait", async () => {
	const { step, sleeps } = await session();
	assert.equal(await step("someone"), "max");
	assert.deepEqual(sleeps, []);
});

test("a step that comes before its spawn settles gets the routed effort", async () => {
	const { spawn, step } = await session();
	let settle: (started: unknown) => void = () => {};
	const spawning = spawn(() => new Promise((resolve) => (settle = resolve)));
	await flush();
	let effort: string | undefined;
	const stepping = step("agent-1").then((e) => {
		effort = e;
	});
	await flush();
	assert.equal(effort, undefined);
	settle(await STARTED());
	await Promise.all([spawning, stepping]);
	assert.equal(effort, "high");
});

test("a spawn that never settles holds another agent's step for the bound only", async () => {
	const { spawn, step, sleeps } = await session();
	spawn(() => new Promise(() => {}));
	await flush();
	let effort: string | undefined;
	const stepping = step("other").then((e) => {
		effort = e;
	});
	await flush();
	const bound = sleeps.find(({ ms }) => ms < 5000);
	assert.ok(bound, "the step set a short timer");
	assert.equal(effort, undefined);
	bound.wake();
	await stepping;
	assert.equal(effort, "max");
});

test("a resumed agent keeps its routed effort after its turn ends", async () => {
	const { $, hooks, spawn, step, complete, sleeps, fetched } = await session();
	await spawn(STARTED);
	assert.equal(await step("agent-1"), "high");
	await complete("agent-1");
	const resumed = await hooks[SPAWN_HOOK]?.(
		$,
		{ ...SPAWN, tool_use_id: "toolu_2", resume: { agentId: "agent-1" } },
		Object.assign(async () => ({ agentId: "agent-1", model: "haiku" }), {
			signal: new AbortController().signal,
			origin: { plugin: "engine" },
		}),
	);
	assert.deepEqual(resumed, { agentId: "agent-1", model: "haiku" });
	assert.equal(fetched.length, 1);
	assert.equal(await step("agent-1"), "high");
	assert.deepEqual(
		sleeps.filter(({ ms }) => ms < 5000),
		[],
	);
});

test("the oldest routed effort goes once the store is full", async () => {
	const { spawn, step } = await session();
	for (let i = 0; i <= EFFORTS_MAX; i++)
		await spawn(async () => ({ agentId: `agent-${i}`, model: "haiku" }));
	assert.equal(await step("agent-0"), "max");
	assert.equal(await step("agent-1"), "high");
	assert.equal(await step(`agent-${EFFORTS_MAX}`), "high");
});

test("a spawn another plugin starts passes through without a request", async () => {
	const { spawn, fetched, logs } = await session();
	const outcome = await spawn(STARTED, "other");
	assert.deepEqual(outcome, await STARTED());
	assert.deepEqual(fetched, []);
	assert.deepEqual(logs, []);
});

for (const [name, answer] of [
	["an error result", async () => ({ isError: true })],
	[
		"a throw",
		async () => {
			throw new Error("boom");
		},
	],
] as const)
	test(`an Agent call that ends in ${name} drops the caller's effort`, async () => {
		const { hooks, spawn, logs } = await session();
		const run = (next: () => Promise<unknown>) =>
			hooks['tool.call {"tool":"Agent"}']?.(
				{},
				{ tool: "Agent", tool_use_id: "toolu_1", effort: "low" },
				Object.assign(next, nextHook()),
			);
		await run(answer)?.catch(() => undefined);
		await spawn(STARTED);
		assert.match(logs.join(), / · high · /);
	});
