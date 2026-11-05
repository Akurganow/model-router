import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_ROLE } from "./brief.ts";
import { register } from "./claude.ts";
import { useWorld } from "./omp-fakes.ts";
import { createExtension } from "./omp-router.ts";

// Claude Code words its general-purpose agent differently from omp, so both sides must ignore their wording.
const CLAUDE_WORDING = "Claude Code wording";
const ANSWER = JSON.stringify({
	model: "jev-1.14.0",
	answers: {
		tier: { type: "score", probabilities: { 0: 0.9, 1: 0.05, 2: 0.05 } },
		work: { type: "score", probabilities: { 0: 0.2, 1: 0.6, 2: 0.2 } },
	},
});

type Hook = (...args: unknown[]) => Promise<unknown>;
type Body = { state: { role: unknown } };

const world = useWorld();

// Offers the agent as built-in, then spawns it as the engine does. Returns the role Jev received.
async function claudeRole(agent: string): Promise<unknown> {
	const hooks = new Map<string, Hook>();
	const sent: unknown[] = [];
	const on = (event: string, ...rest: unknown[]) => {
		hooks.set(event, rest.at(-1) as Hook);
		return { catch: () => undefined };
	};
	const $ = {
		clock: {
			after: () => ({ cancel() {} }),
			sleep: () => new Promise(() => {}),
		},
		env: { get: async () => undefined },
		http: {
			fetch: async (_url: string, init: { body: string }) => {
				const body = JSON.parse(init.body) as Body;
				sent.push(body.state.role);
				return { status: 200, ok: true, headers: {}, text: ANSWER };
			},
		},
		ui: { log: async () => undefined },
	};
	const next = Object.assign(async () => ({}), {
		signal: new AbortController().signal,
		origin: { plugin: "engine" },
	});
	register(on as never, { api_key: "ts-key" });
	const offer = { agent, source: "built-in", description: CLAUDE_WORDING };
	await hooks.get("agent.offer")?.($, offer, next);
	const spawn = {
		tool_use_id: "toolu_1",
		prompt: "a",
		description: "d",
		subagentType: agent,
		fork: false,
	};
	await hooks.get("agent.spawn")?.($, spawn, next);
	return sent[0];
}

for (const agent of ["general-purpose", "claude"])
	test(`${agent} and omp task send the same fixed role`, async () => {
		const fromClaude = await claudeRole(agent);
		createExtension(world.imports)(world.pi);
		await world.toolCall("c", { tasks: [{ task: "a" }] });
		const fromOmp = (world.sent[0]?.body as Body | undefined)?.state.role;
		assert.equal(fromClaude, DEFAULT_ROLE);
		assert.equal(fromOmp, DEFAULT_ROLE);
		assert.equal(fromClaude, fromOmp);
	});
