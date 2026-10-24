import assert from "node:assert/strict";
import { test } from "node:test";
import { register } from "./claude.ts";

type Hook = ($: unknown, e: unknown, next: unknown) => Promise<unknown>;

const AGENT_CALL = 'tool.call {"tool":"Agent"}';
const CLOCK = {
	after: () => ({ cancel() {} }),
	sleep: () => new Promise(() => {}),
};
const nextHook = () =>
	Object.assign(async () => ({}), { signal: new AbortController().signal });

function registered(
	options: Record<string, unknown> = {},
): Record<string, Hook> {
	const hooks: Record<string, Hook> = {};
	const on = (event: string, ...rest: unknown[]) => {
		const matcher = rest.length > 1 ? ` ${JSON.stringify(rest[0])}` : "";
		hooks[`${event}${matcher}`] = rest.at(-1) as Hook;
		return { catch: () => undefined };
	};
	register(on as never, options);
	return hooks;
}

test("a new registration forgets the offers made before it", async () => {
	const logs: string[] = [];
	const $ = {
		clock: CLOCK,
		env: { get: async () => undefined },
		tool: { check: async () => ({ decision: "allow" }) },
		ui: { log: async (text: string) => logs.push(text) },
	};
	const next = nextHook();
	const call = { tool: "Agent", prompt: "p", description: "d" };

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
	offered = true,
) {
	const reads: string[] = [];
	const requests: { url: string; model: unknown }[] = [];
	const roles: unknown[] = [];
	const $ = {
		clock: CLOCK,
		env: {
			get: async (name: string) => {
				reads.push(name);
				return env[name];
			},
		},
		http: {
			fetch: async (url: string, init: { body: string }) => {
				const body = JSON.parse(init.body);
				requests.push({ url, model: body.model });
				roles.push(body.state.role);
				return { status: 200, ok: true, headers: {}, text: ANSWER };
			},
		},
		tool: { check: async () => ({ decision: "allow" }) },
		ui: { log: async () => undefined },
	};
	const next = nextHook();
	const hooks = registered(options);
	if (offered)
		await hooks["agent.offer"]?.(
			$,
			{ agent: "general-purpose", source: "built-in" },
			next,
		);
	await hooks[AGENT_CALL]?.(
		$,
		{ tool: "Agent", prompt: "p", description: "d" },
		next,
	);
	return { reads, requests, roles };
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

test("under extended a fresh registration with no offers routes with the neutral role", async () => {
	const { requests, roles } = await routedCall(
		{ api_key: "ts-key", scope: "extended" },
		{},
		false,
	);
	assert.equal(requests.length, 1);
	assert.deepEqual(roles, ["An agent with no description."]);
});

test("under core a fresh registration with no offers sends no request", async () => {
	const { requests } = await routedCall({ api_key: "ts-key" }, {}, false);
	assert.deepEqual(requests, []);
});

test("register hooks the session start, the config tool and both commands by literal matcher", () => {
	assert.deepEqual(Object.keys(registered()).sort(), [
		"agent.offer",
		'command.run {"command":"model-router:provider"}',
		'command.run {"command":"model-router:scope"}',
		"session.start",
		'tool.call {"tool":"Agent"}',
		'tool.call {"tool":"mcp__model-router__config"}',
	]);
});
