import assert from "node:assert/strict";
import { test } from "node:test";
import { WORK_TEXTS, work } from "./effort.ts";
import type { Level, Probabilities } from "./part.ts";

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
