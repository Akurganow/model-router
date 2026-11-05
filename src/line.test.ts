import assert from "node:assert/strict";
import { test } from "node:test";
import { routedLine, skippedLine } from "./line.ts";

const BASE = {
	level: 2,
	probabilities: "0.90/0.80",
	suffix: " · jev x",
} as const;

test("a routed line with an effort carries the effort segment", () => {
	assert.equal(
		routedLine({ ...BASE, target: "opus", effort: "high" }),
		"L2 opus · high · p=0.90/0.80 · jev x",
	);
});

test("a routed line without an effort leaves the segment out", () => {
	assert.equal(
		routedLine({ ...BASE, level: 0, target: "@smol" }),
		"L0 @smol · p=0.90/0.80 · jev x",
	);
});

test("a routed line without a target says no change", () => {
	assert.equal(
		routedLine({ ...BASE, level: 1, target: undefined }),
		"L1 no change · p=0.90/0.80 · jev x",
	);
});

test("a skipped line names the reason", () => {
	assert.equal(skippedLine("bad reply"), "skipped, bad reply");
});
