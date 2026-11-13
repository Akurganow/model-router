import assert from "node:assert/strict";
import { test } from "node:test";
import { pinnedLine, routedLine, skippedLine } from "./line.ts";

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

test("a routed line names a slot that has no model", () => {
	assert.equal(
		routedLine({
			...BASE,
			level: 1,
			target: "middle model unset",
			effort: "medium",
		}),
		"L1 middle model unset · medium · p=0.90/0.80 · jev x",
	);
});

test("a pinned line holds the level and the target only", () => {
	assert.equal(pinnedLine(2, "large model unset"), "L2 large model unset");
	assert.equal(pinnedLine(0, "@smol"), "L0 @smol");
});

test("a skipped line names the reason", () => {
	assert.equal(skippedLine("bad reply"), "skipped, bad reply");
});
