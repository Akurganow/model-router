import assert from "node:assert/strict";
import { test } from "node:test";
import { routingState } from "./brief.ts";
import type { Decision } from "./compose.ts";
import { decide, scoreWork } from "./decide.ts";
import { work } from "./effort.ts";
import { jevAnswer, streamed } from "./jev-fakes.ts";
import { tier } from "./model.ts";
import { plan } from "./provider.ts";

const part = (level: 0 | 1 | 2, p: number) => ({
	level,
	probabilities: { 0: 0.05, 1: 0.05, 2: 0.05, [level]: p },
});
const decision = (parts: Decision["parts"], model = "m"): Decision => ({
	parts,
	model,
	usage: { input_tokens: 1, output_tokens: 2 },
});

test("a tier part alone gives the level, its probability and the suffix", () => {
	assert.deepEqual(decide(decision({ tier: part(2, 0.9) }), "tier"), {
		tier: 2,
		probabilities: "0.90",
		suffix: " · jev m · 1/2 tok",
	});
});

test("a tier and a work part give both levels and a joined probability", () => {
	assert.deepEqual(
		decide(
			decision({ tier: part(0, 0.9), work: part(1, 0.7) }),
			"tier",
			"work",
		),
		{
			tier: 0,
			work: 1,
			probabilities: "0.90/0.70",
			suffix: " · jev m · 1/2 tok",
		},
	);
});

test("a missing part is a bad reply", () => {
	assert.deepEqual(decide(decision({ tier: part(1, 0.9) }), "tier", "work"), {
		skipped: "bad reply",
	});
	assert.deepEqual(decide(decision({}), "tier"), { skipped: "bad reply" });
});

test("a skipped decision passes through", () => {
	assert.deepEqual(decide({ skipped: "no key" }, "tier", "work"), {
		skipped: "no key",
	});
});

const STATE = routingState({
	role: "coder",
	description: "Fix",
	task: "Fix it.",
});

/**
 * Runs scoreWork against a fake Jev that replies with the body and returns the
 * result and the request bodies Jev received.
 */
async function scoreAgainst(body: unknown) {
	const bodies: unknown[] = [];
	const result = await scoreWork({
		state: STATE,
		attempts: plan("typesafe", { typesafe: true, openrouter: false }),
		keys: { typesafe: "test-key" },
		fetchFn: async (_url, init) => {
			bodies.push(JSON.parse(String(init?.body)));
			return streamed(200, body);
		},
		signal: new AbortController().signal,
	});
	return { result, bodies };
}

test("scoreWork asks for the tier and work questions and reads both levels", async () => {
	const { result, bodies } = await scoreAgainst(jevAnswer(2, 0));
	assert.deepEqual(result, {
		tier: 2,
		work: 0,
		probabilities: "0.90/0.90",
		suffix: " · jev jev-1.14.0 · 812/9 tok",
	});
	assert.equal(bodies.length, 1);
	assert.deepEqual((bodies[0] as { questions: unknown }).questions, {
		tier: tier.question,
		work: work.question,
	});
});

test("scoreWork returns a bad reply for a reply without the work part", async () => {
	const { result } = await scoreAgainst(jevAnswer(2));
	assert.deepEqual(result, { skipped: "bad reply" });
});

test("scoreWork returns the skip of a call with no usable provider", async () => {
	const result = await scoreWork({
		state: STATE,
		attempts: plan("typesafe", { typesafe: true, openrouter: false }),
		keys: {},
		fetchFn: async () => streamed(200, jevAnswer(1, 1)),
		signal: new AbortController().signal,
	});
	assert.ok("skipped" in result);
});
