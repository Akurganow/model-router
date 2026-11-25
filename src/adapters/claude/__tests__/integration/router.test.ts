import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
	AGENT_CALL,
	ANSWER,
	type Answers,
	type Call,
	CLOCK,
	FULL,
	FULL_SUFFIX,
	flush,
	nextHook,
	registered,
	routed,
	routedCall,
	SPAWN,
} from "#adapters/claude/__tests__/support/fakes.ts";
import { OPENAI_REPLY } from "#core/__tests__/support/replies.ts";

// Rows are the tier level, columns the work level. The values are written out, not read from the ladder.
const LADDER = [
	["haiku", ["medium", "high", "xhigh"]],
	["sonnet", ["low", "medium", "high"]],
	["opus", ["low", "medium", "high"]],
] as const;

describe("Claude Code decision for each tier and work level", () => {
	for (const [tier, [model, efforts]] of LADDER.entries())
		for (const [work, effort] of efforts.entries())
			test(`tier ${tier} and work ${work} give ${model} at ${effort}`, async () => {
				const { logs, spawned, requestEffort } = await routed({
					tier,
					work,
					...FULL,
				});
				assert.deepEqual(logs, [
					`L${tier} ${model} · ${effort} · p=0.90/0.90${FULL_SUFFIX}`,
				]);
				assert.equal(spawned?.model, model);
				assert.equal(requestEffort, effort);
			});
});

describe("Claude Code reply and effort edge cases", () => {
	for (const missing of ["tier", "work"] as const)
		test(`a reply without the ${missing} part skips and leaves the spawn alone`, async () => {
			const answers = { tier: 1, work: 1, ...FULL, [missing]: undefined };
			const { logs, spawned, requestEffort } = await routed(answers);
			assert.deepEqual(logs, ["skipped, bad reply"]);
			assert.deepEqual(spawned, SPAWN);
			assert.equal(requestEffort, "max");
		});

	test("a caller-set effort is logged in place of the effort and applies none", async () => {
		const { logs, spawned, requestEffort } = await routed(
			{ tier: 2, work: 0, ...FULL },
			{ callerEffort: true },
		);
		assert.deepEqual(logs, [
			`L2 opus · caller effort · p=0.90/0.90${FULL_SUFFIX}`,
		]);
		assert.equal(spawned?.model, "opus");
		assert.equal(requestEffort, "max");
	});

	test("an effort in CLAUDE_CODE_EFFORT_LEVEL is logged in place of the effort and applies none", async () => {
		const { logs, spawned, requestEffort } = await routed(
			{ tier: 0, work: 2, ...FULL },
			{ env: { CLAUDE_CODE_EFFORT_LEVEL: "high" } },
		);
		assert.deepEqual(logs, [
			`L0 haiku · env effort · p=0.90/0.90${FULL_SUFFIX}`,
		]);
		assert.equal(spawned?.model, "haiku");
		assert.equal(requestEffort, "max");
	});
});

describe("decision line suffix", () => {
	const line = async (extra: Answers, run: Omit<Call, "reply"> = {}) =>
		(await routed({ tier: 1, work: 1, ...extra }, run)).logs[0];
	const BASE = "L1 sonnet · medium · p=0.90/0.90";

	test("the provider, its model and the token counts follow the probabilities", async () => {
		assert.equal(await line(FULL), `${BASE}${FULL_SUFFIX}`);
	});

	test("usage with one count, or a count that is not a whole number, adds no tokens", async () => {
		assert.equal(
			await line({ usage: { input_tokens: 5 } }),
			"L1 sonnet · medium · p=0.90/0.90 · typesafe",
		);
		assert.equal(
			await line({ usage: { input_tokens: 5, output_tokens: 1.5 } }),
			"L1 sonnet · medium · p=0.90/0.90 · typesafe",
		);
	});
});

test("the engine's fetch receives exactly four headers", async () => {
	const { headers } = await routed({ tier: 1, work: 1, ...FULL });
	assert.deepEqual(headers, [
		{
			Authorization: "Bearer ts-key",
			Accept: "application/json",
			"Content-Type": "application/json",
			"User-Agent":
				"model-router/dev (+https://github.com/Akurganow/model-router)",
		},
	]);
});

test("a host cancel while Jev is being asked skips the routing and starts the spawn", async () => {
	const hooks = registered({ api_key: "ts-key" });
	const logs: string[] = [];
	const $ = {
		clock: CLOCK,
		env: { get: async () => undefined },
		http: { fetch: () => new Promise<never>(() => {}) },
		tool: { check: async () => ({ decision: "allow" }) },
		ui: { log: async (text: string) => void logs.push(text) },
	};
	await hooks["agent.offer"]?.(
		$,
		{ agent: "general-purpose", source: "built-in" },
		nextHook(),
	);
	const cancel = new AbortController();
	const started: unknown[] = [];
	const engine = Object.assign(
		async (spawn: unknown) => {
			started.push(spawn);
			return { agentId: "agent-1" };
		},
		{ signal: cancel.signal, origin: { plugin: "engine" } },
	);
	hooks[AGENT_CALL]?.($, SPAWN, engine);
	await flush();
	assert.deepEqual(started, []);
	cancel.abort();
	await flush();
	assert.deepEqual(started, [SPAWN]);
});

describe("the stored text of both settings reaches the core", () => {
	for (const [setting, value] of [
		["provider", "auto"],
		["gateway", "fast"],
	] as const)
		test(`${setting} ${value} skips, reads no key and sends no request`, async () => {
			const { logs, reads, requests } = await routedCall({
				options: { api_key: "ts-key", [setting]: value },
				env: { TYPESAFE_API_KEY: "ts-key" },
			});
			assert.deepEqual(logs, [`skipped, ${setting} not valid: run setup`]);
			assert.deepEqual(reads, []);
			assert.deepEqual(requests, []);
		});

	for (const gateway of ["", "   ", null])
		test(`gateway ${JSON.stringify(gateway)} reads as direct`, async () => {
			const { requests } = await routedCall({
				options: { api_key: "ts-key", gateway },
			});
			assert.deepEqual(
				requests.map((r) => r.url),
				["https://api.typesafe.ai/v1/systemone"],
			);
		});
});

describe("the models setting reaches the core", () => {
	const MODELS = "{typesafe:jev-latest, openai:gpt-6-luna}";
	const KEYS = { api_key: "ts-key", openai_api_key: "oa-key" };
	const sent = async (options: Record<string, unknown>) =>
		(
			await routedCall({
				options: { ...KEYS, ...options },
				reply: (url) => ({
					status: 200,
					ok: true,
					headers: {},
					text: url.includes("openai.com") ? OPENAI_REPLY : ANSWER,
				}),
			})
		).requests.map((r) => r.model);

	test("a routed spawn sends the model of the provider in force, across a provider switch", async () => {
		assert.deepEqual(await sent({ models: MODELS }), ["jev-latest"]);
		assert.deepEqual(await sent({ models: MODELS, provider: "openai" }), [
			"gpt-6-luna",
		]);
		assert.deepEqual(await sent({ models: MODELS, provider: "typesafe" }), [
			"jev-latest",
		]);
	});

	for (const models of ["", "   ", null])
		test(`models ${JSON.stringify(models)} routes with the defaults`, async () => {
			assert.deepEqual(await sent({ models }), ["jev-latest"]);
		});

	for (const models of [
		"{foo:bar}",
		"{typesafe:}",
		"typesafe",
		"{typesafe:a, typesafe:b}",
		"{typesafe:a/b}",
		'{"typesafe":5}',
		"jev",
	])
		test(`models ${models} skips, reads no key and sends no request`, async () => {
			const { logs, reads, requests } = await routedCall({
				options: { ...KEYS, models },
				env: { TYPESAFE_API_KEY: "ts-key" },
			});
			assert.deepEqual(logs, ["skipped, models not valid: run setup"]);
			assert.deepEqual(reads, []);
			assert.deepEqual(requests, []);
		});
});
