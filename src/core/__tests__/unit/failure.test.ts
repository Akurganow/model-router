import assert from "node:assert/strict";
import { test } from "node:test";
import { fallsBack, UNKNOWN } from "#core/scoring/failure.ts";

test("a failed request does not fall back to the next provider", () => {
	assert.equal(fallsBack(UNKNOWN), false);
});
