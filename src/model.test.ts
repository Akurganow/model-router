import assert from "node:assert/strict";
import { test } from "node:test";
import { TIER_TEXTS, tier } from "./model.ts";

test("the tier question carries its key, the score type, instructions that name the task fields, and the three texts", () => {
	assert.equal(tier.key, "tier");
	assert.equal(tier.question.type, "score");
	for (const name of ["task", "role", "description"])
		assert.ok(tier.question.instructions.includes(`\`${name}\``));
	assert.deepEqual(tier.question.criteria, [...TIER_TEXTS]);
});

test("the calibrated data is three tier texts", () => {
	assert.equal(TIER_TEXTS.length, 3);
});

test("a near tie goes to the highest level within the margin", () => {
	assert.equal(tier.pick({ "0": 0.2, "1": 0.42, "2": 0.38 }), 2);
	assert.equal(tier.pick({ "0": 0.1, "1": 0.6, "2": 0.3 }), 1);
	assert.equal(tier.pick({ "0": 0.34, "1": 0.33, "2": 0.33 }), 2);
	assert.equal(tier.pick({ "0": 0.5, "1": 0.45, "2": 0.05 }), 1);
});

test("a gap of exactly the margin is not a tie", () => {
	assert.equal(tier.pick({ "0": 0.1, "1": 0.25, "2": 0.15 }), 1);
	assert.equal(tier.pick({ "0": 0.1, "1": 0.25, "2": 0.16 }), 2);
});
