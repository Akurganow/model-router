import assert from "node:assert/strict";
import { test } from "node:test";
import {
	decisionSuffix,
	formatProbability,
	pinnedLine,
	routedLine,
	skippedLine,
} from "../../output/line.ts";

const BASE = {
	level: 2,
	probabilities: "0.90/0.80",
	suffix: " · typesafe x",
} as const;

test("a routed line with an effort carries the effort segment", () => {
	assert.equal(
		routedLine({ ...BASE, target: "opus", effort: "high" }),
		"L2 opus · high · p=0.90/0.80 · typesafe x",
	);
});

test("a routed line without an effort leaves the segment out", () => {
	assert.equal(
		routedLine({ ...BASE, level: 0, target: "@smol" }),
		"L0 @smol · p=0.90/0.80 · typesafe x",
	);
});

test("a routed line names a slot that has no model", () => {
	assert.equal(
		routedLine({
			...BASE,
			level: 1,
			target: "middle model unset",
			effort: "medium",
		}),
		"L1 middle model unset · medium · p=0.90/0.80 · typesafe x",
	);
});

test("a pinned line holds the level and the target only", () => {
	assert.equal(pinnedLine(2, "large model unset"), "L2 large model unset");
	assert.equal(pinnedLine(0, "@smol"), "L0 @smol");
});

test("a skipped line names the reason", () => {
	assert.equal(skippedLine("bad reply"), "skipped, bad reply");
});

test("a probability prints with two decimals", () => {
	assert.equal(formatProbability(0.9), "0.90");
	assert.equal(formatProbability(0.126), "0.13");
	assert.equal(formatProbability(1), "1.00");
});

test("the suffix leaves out null, missing or unsafe usage", () => {
	const model = "jev-1";
	assert.equal(
		decisionSuffix({
			provider: "typesafe",
			model,
			inputTokens: null,
			outputTokens: 3,
		}),
		" · typesafe jev-1",
	);
	assert.equal(
		decisionSuffix({ provider: "typesafe", model }),
		" · typesafe jev-1",
	);
	assert.equal(
		decisionSuffix({
			provider: "typesafe",
			model,
			inputTokens: -1,
			outputTokens: 3,
		}),
		" · typesafe jev-1",
	);
});

test("the suffix names the provider alone when the reply carries no model name", () => {
	assert.equal(
		decisionSuffix({ provider: "typesafe", model: "" }),
		" · typesafe",
	);
});

test("the suffix ends with the failed provider and its reason after a fallback", () => {
	assert.equal(
		decisionSuffix({
			provider: "openrouter",
			model: "jev-1",
			inputTokens: 120,
			outputTokens: 8,
			failed: { provider: "typesafe", reason: "HTTP 503" },
		}),
		" · openrouter jev-1 · 120/8 tok · typesafe HTTP 503",
	);
	assert.equal(
		decisionSuffix({
			provider: "openrouter",
			model: "",
			failed: { provider: "typesafe", reason: "HTTP 503" },
		}),
		" · openrouter · typesafe HTTP 503",
	);
});
