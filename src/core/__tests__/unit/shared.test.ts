import assert from "node:assert/strict";
import { test } from "node:test";
import { isProbability } from "#core/scoring/formats/shared.ts";

test("a probability is a number from 0 to 1, both ends included", () => {
	const kept = [-0.1, 1.1, Number.NaN, 0, 1].filter(isProbability);
	assert.deepEqual(kept, [0, 1]);
});
