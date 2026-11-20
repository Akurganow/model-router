import assert from "node:assert/strict";
import { test } from "node:test";
import type { Level, Probabilities } from "#core/parts/part.ts";
import { WORK_TEXTS, work } from "#core/parts/work.ts";

test("the work question carries its key, the score type, instructions that name the task, and the three texts", () => {
	assert.equal(work.key, "work");
	assert.equal(work.question.type, "score");
	assert.ok(work.question.instructions.includes("`task`"));
	assert.deepEqual(work.question.criteria, [...WORK_TEXTS]);
});

test("the calibrated data is three work texts", () => {
	assert.equal(WORK_TEXTS.length, 3);
});

test("the work index stays at the middle unless an end is clearly more likely", () => {
	const cases: [Probabilities, Level][] = [
		[{ "0": 0.4, "1": 0.35, "2": 0.25 }, 1],
		[{ "0": 0.7, "1": 0.25, "2": 0.05 }, 0],
		[{ "0": 0.6, "1": 0.3, "2": 0.1 }, 1],
		[{ "0": 0.1, "1": 0.4, "2": 0.5 }, 1],
		[{ "0": 0, "1": 0.4, "2": 0.6 }, 2],
		[{ "0": 0.45, "1": 0.1, "2": 0.45 }, 1],
	];
	for (const [p, expected] of cases) assert.equal(work.pick(p), expected);
});

test("the work index leaves the middle just past each factor and not just short of it", () => {
	const cases: [Probabilities, Level][] = [
		// Down: 2 ** 1.25 times a middle of 0.25 is 0.5946.
		[{ "0": 0.594, "1": 0.25, "2": 0.1 }, 1],
		[{ "0": 0.595, "1": 0.25, "2": 0.1 }, 0],
		// Up: 2 ** 0.5 times a middle of 0.25 is 0.3536.
		[{ "0": 0.1, "1": 0.25, "2": 0.353 }, 1],
		[{ "0": 0.1, "1": 0.25, "2": 0.354 }, 2],
	];
	for (const [p, expected] of cases) assert.equal(work.pick(p), expected);
});

test("when both ends beat the middle, the likelier end wins", () => {
	assert.equal(work.pick({ "0": 0.5, "1": 0.1, "2": 0.3 }), 0);
	assert.equal(work.pick({ "0": 0.3, "1": 0.1, "2": 0.5 }), 2);
});
