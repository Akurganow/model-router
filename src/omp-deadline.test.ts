import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deadlineFor, MIN_DEADLINE_MS } from "./handler-deadline.ts";
import {
	DEFAULT_TIMEOUT_MS,
	timeoutTooShort,
	usableTimeout,
} from "./omp-deadline.ts";

describe("usableTimeout", () => {
	it("keeps a finite number above 0", () => {
		assert.equal(usableTimeout(2000), 2000);
		assert.equal(usableTimeout(0.5), 0.5);
	});

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
		it(`takes omp's default for ${String(value)}`, () => {
			assert.equal(usableTimeout(value), DEFAULT_TIMEOUT_MS);
		});
});

describe("the deadline under omp's tool call timeout", () => {
	for (const [timeout, deadline] of [
		[30000, 8000],
		[9000, 7000],
		[5000, 3000],
		[3000, 1000],
		[2999, 999],
	] as const)
		it(`${timeout} ms leaves ${deadline} ms`, () => {
			assert.equal(deadlineFor(timeout), deadline);
		});

	it("routes from 3000 ms up", () => {
		assert.ok(deadlineFor(3000) >= MIN_DEADLINE_MS);
		assert.ok(deadlineFor(2999) < MIN_DEADLINE_MS);
	});
});

describe("timeoutTooShort", () => {
	it("names the timeout and what it leaves", () => {
		assert.equal(
			timeoutTooShort(2500, deadlineFor(2500)),
			"tool call timeout 2500 ms leaves 500 ms to route",
		);
	});

	it("never names a negative time", () => {
		assert.equal(
			timeoutTooShort(1000, deadlineFor(1000)),
			"tool call timeout 1000 ms leaves 0 ms to route",
		);
	});
});
