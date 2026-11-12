import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { budgetFor } from "./omp-deadline.ts";

const closed = (timeout: number, left: number) => ({
	closed: `tool call timeout ${timeout} ms leaves ${left} ms to route`,
});

describe("budgetFor", () => {
	for (const value of [
		undefined,
		null,
		Number.NaN,
		0,
		-1,
		Infinity,
		"x",
		"5000",
	])
		it(`takes omp's default of 30000 for ${String(value)}`, () => {
			assert.deepEqual(budgetFor(value), { deadline: 8000 });
		});

	for (const [timeout, deadline] of [
		[3000, 1000],
		[4000, 2000],
		[9000, 7000],
		[10000, 8000],
		[30000, 8000],
		[60000, 8000],
	] as const)
		it(`gives ${timeout} ms a ${deadline} ms deadline`, () => {
			assert.deepEqual(budgetFor(timeout), { deadline });
		});

	for (const [timeout, left] of [
		[2999, 999],
		[2500, 500],
		[0.5, 0],
	] as const)
		it(`closes the batch at ${timeout} ms and never names a negative time`, () => {
			assert.deepEqual(budgetFor(timeout), closed(timeout, left));
		});
});
