import assert from "node:assert/strict";
import { test } from "node:test";
import type { Level } from "../src/part.ts";
import { crossValidate, type Row, readRows, score } from "./compare-rules.ts";

const P = (a: number, b: number, c: number) => ({ 0: a, 1: b, 2: c });
const row = (expected: Level, contested: string[] = []): Row => ({
	description: "case",
	expected,
	work: 1,
	tier: P(0.1, 0.2, 0.7),
	workProbabilities: P(0.2, 0.6, 0.2),
	contested,
});
const TIER = { key: "tier", label: "expected", probs: "tier" } as const;

test("score counts agreement, direction, recall and the share of each pick", () => {
	const rows = [row(0), row(1), row(2, ["expected"]), row(2)];
	const s = score(rows, [0, 2, 1, 2], TIER);
	assert.equal(s.agreement, 0.5);
	assert.equal(s.uncontested, 2 / 3);
	assert.equal(s.under, 0.25);
	assert.equal(s.over, 0.25);
	assert.deepEqual(s.recall, [1, 0, 0.5]);
	assert.deepEqual(s.share, [0.25, 0.25, 0.5]);
	assert.deepEqual(s.confusion, [
		[1, 0, 0],
		[0, 0, 1],
		[0, 1, 1],
	]);
});

test("crossValidate picks every row with a rule fitted without it", () => {
	const rows = Array.from({ length: 10 }, (_, i) => row((i % 3) as Level));
	const seen: number[] = [];
	const held = crossValidate(
		{
			name: "probe",
			fit: (train) => {
				seen.push(train.length);
				return { tier: () => 1, work: () => 1 };
			},
		},
		rows,
	);
	assert.deepEqual(seen, [8, 8, 8, 8, 8]);
	assert.equal(held.tier.length, 10);
});

test("readRows refuses a record that does not match the calibration set", () => {
	assert.throws(
		() => readRows('{"expected":0}\n', '{"expected":0}\n{"expected":1}\n'),
		/record again/,
	);
});

test("readRows refuses a record whose rows name other cases", () => {
	assert.throws(
		() => readRows('{"description":"a"}\n', '{"description":"b"}\n'),
		/row 1 is "a"/,
	);
});
