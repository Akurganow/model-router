import assert from "node:assert/strict";
import { test } from "node:test";
import type { Decision } from "./compose.ts";
import { decide } from "./decide.ts";

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
