import assert from "node:assert/strict";
import { test } from "node:test";
import { formatProbability } from "../../part.ts";

test("a probability prints with two decimals", () => {
	assert.equal(formatProbability(0.9), "0.90");
	assert.equal(formatProbability(0.126), "0.13");
	assert.equal(formatProbability(1), "1.00");
});
