import assert from "node:assert/strict";
import { test } from "node:test";
import {
	scoringReply,
	systemOneAnswer,
} from "#core/__tests__/support/replies.ts";
import { routingState } from "#core/brief/brief.ts";
import { decide, scoreWork } from "#core/decision/decide.ts";
import { tier } from "#core/parts/tier.ts";
import { work } from "#core/parts/work.ts";
import { plan } from "#core/providers/provider.ts";
import type { Decision } from "#core/scoring/route.ts";
import { realClock } from "#utils/clock.ts";

const part = (level: 0 | 1 | 2, p: number) => ({
	level,
	probabilities: { 0: 0.05, 1: 0.05, 2: 0.05, [level]: p },
});
const decision = (parts: Decision["parts"], model = "m"): Decision => ({
	parts,
	holder: "typesafe",
	model,
	usage: { input_tokens: 1, output_tokens: 2 },
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
			suffix: " · typesafe m · 1/2 tok",
		},
	);
});

test("a decision after a fallback ends its suffix with the failed provider and its reason", () => {
	const decided = decide(
		{
			...decision({ tier: part(0, 0.9), work: part(1, 0.7) }),
			holder: "openrouter",
			firstFailed: { holder: "typesafe", reason: "HTTP 503" },
		},
		"tier",
		"work",
	);
	assert.deepEqual(decided, {
		tier: 0,
		work: 1,
		probabilities: "0.90/0.70",
		suffix: " · openrouter m · 1/2 tok · typesafe HTTP 503",
	});
});

test("a missing part is a bad reply", () => {
	assert.deepEqual(decide(decision({ tier: part(1, 0.9) }), "tier", "work"), {
		skipped: "bad reply",
	});
	assert.deepEqual(decide(decision({ work: part(1, 0.9) }), "tier", "work"), {
		skipped: "bad reply",
	});
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
		attempts: plan("typesafe", { typesafe: "test-key" }),
		fetchFn: async (_url, init) => {
			bodies.push(JSON.parse(String(init?.body)));
			return scoringReply(200, body);
		},
		clock: realClock,
		signal: new AbortController().signal,
	});
	return { result, bodies };
}

test("scoreWork asks for the tier and work questions and reads both levels", async () => {
	const { result, bodies } = await scoreAgainst(systemOneAnswer(2, 0));
	assert.deepEqual(result, {
		tier: 2,
		work: 0,
		probabilities: "0.90/0.90",
		suffix: " · typesafe jev-1.14.0 · 812/9 tok",
	});
	assert.equal(bodies.length, 1);
	assert.deepEqual((bodies[0] as { questions: unknown }).questions, {
		tier: tier.question,
		work: work.question,
	});
});

test("scoreWork returns a bad reply for a reply without the work part", async () => {
	const { result } = await scoreAgainst(systemOneAnswer(2));
	assert.deepEqual(result, { skipped: "bad reply" });
});
