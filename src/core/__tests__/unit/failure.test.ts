import assert from "node:assert/strict";
import { test } from "node:test";
import { fallsBack } from "../../scoring/failure.ts";

test("a failed request does not fall back to the next provider", () => {
	assert.equal(fallsBack({ failure: "failed" }), false);
});
