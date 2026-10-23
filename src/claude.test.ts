import assert from "node:assert/strict";
import { test } from "node:test";
import { register } from "./claude.ts";

type Hook = ($: unknown, e: unknown, next: unknown) => Promise<unknown>;

function registered(
	options: Record<string, unknown> = {},
): Record<string, Hook> {
	const hooks: Record<string, Hook> = {};
	const on = (event: string, ...rest: unknown[]) => {
		hooks[event] = rest.at(-1) as Hook;
		return { catch: () => undefined };
	};
	register(on as never, options);
	return hooks;
}

test("a new registration forgets the offers made before it", async () => {
	const logs: string[] = [];
	const $ = {
		clock: {
			after: () => ({ cancel() {} }),
			sleep: () => new Promise(() => {}),
		},
		env: { get: async () => undefined },
		tool: { check: async () => ({ decision: "allow" }) },
		ui: { log: async (text: string) => logs.push(text) },
	};
	const next = Object.assign(async () => ({}), {
		signal: new AbortController().signal,
	});
	const call = { tool: "Agent", prompt: "p", description: "d" };

	await registered()["agent.offer"]?.(
		$,
		{ agent: "general-purpose", source: "built-in" },
		next,
	);
	const fresh = registered();
	await fresh["tool.call"]?.($, call, next);
	assert.deepEqual(logs, []);

	await fresh["agent.offer"]?.(
		$,
		{ agent: "general-purpose", source: "built-in" },
		next,
	);
	await fresh["tool.call"]?.($, call, next);
	assert.deepEqual(logs, ["skipped, key unset"]);
});

const SCORE = (p: number[]) => ({ type: "score", probabilities: { ...p } });
const ANSWER = JSON.stringify({
	model: "jev-1.14.0",
	answers: { tier: SCORE([0.9, 0.1, 0]), work: SCORE([0.2, 0.6, 0.2]) },
});

async function routedCall(
	options: Record<string, unknown>,
	env: Record<string, string>,
) {
	const reads: string[] = [];
	const requests: { url: string; model: unknown }[] = [];
	const $ = {
		clock: {
			after: () => ({ cancel() {} }),
			sleep: () => new Promise(() => {}),
		},
		env: {
			get: async (name: string) => {
				reads.push(name);
				return env[name];
			},
		},
		http: {
			fetch: async (url: string, init: { body: string }) => {
				requests.push({ url, model: JSON.parse(init.body).model });
				return { status: 200, ok: true, headers: {}, text: ANSWER };
			},
		},
		tool: { check: async () => ({ decision: "allow" }) },
		ui: { log: async () => undefined },
	};
	const next = Object.assign(async () => ({}), {
		signal: new AbortController().signal,
	});
	const hooks = registered(options);
	await hooks["agent.offer"]?.(
		$,
		{ agent: "general-purpose", source: "built-in" },
		next,
	);
	await hooks["tool.call"]?.(
		$,
		{ tool: "Agent", prompt: "p", description: "d" },
		next,
	);
	return { reads, requests };
}

test("an unknown provider value routes as typesafe and reads no OpenRouter key", async () => {
	const { reads, requests } = await routedCall(
		{ provider: "bogus", api_key: "", openrouter_api_key: "or-key" },
		{ TYPESAFE_API_KEY: "ts-key", OPENROUTER_API_KEY: "or-var-key" },
	);
	assert.deepEqual(reads, ["TYPESAFE_API_KEY"]);
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
