import assert from "node:assert/strict";
import { test } from "node:test";
import { TIER_TEXTS, tier } from "../../parts/tier.ts";

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

test("the tier stays at the middle unless an end is clearly more likely", () => {
	assert.equal(tier.pick({ "0": 0.1, "1": 0.48, "2": 0.42 }), 1);
	assert.equal(tier.pick({ "0": 0.05, "1": 0.35, "2": 0.6 }), 2);
	assert.equal(tier.pick({ "0": 0.45, "1": 0.4, "2": 0.15 }), 1);
	assert.equal(tier.pick({ "0": 0.55, "1": 0.4, "2": 0.05 }), 0);
	assert.equal(tier.pick({ "0": 0.34, "1": 0.33, "2": 0.33 }), 1);
});

test("the tier leaves the middle just past each factor and not just short of it", () => {
	// Down: 2 ** 0.25 times a middle of 0.4 is 0.4757.
	assert.equal(tier.pick({ "0": 0.475, "1": 0.4, "2": 0.1 }), 1);
	assert.equal(tier.pick({ "0": 0.476, "1": 0.4, "2": 0.1 }), 0);
	// Up: 2 ** 0.5 times a middle of 0.4 is 0.5657.
	assert.equal(tier.pick({ "0": 0.03, "1": 0.4, "2": 0.565 }), 1);
	assert.equal(tier.pick({ "0": 0.03, "1": 0.4, "2": 0.566 }), 2);
});
