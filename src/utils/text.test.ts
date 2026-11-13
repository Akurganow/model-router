import assert from "node:assert/strict";
import { test } from "node:test";
import { nonEmpty } from "./text.ts";

test("nonEmpty gives a string trimmed", () => {
	assert.equal(nonEmpty("key"), "key");
	assert.equal(nonEmpty("  key \n"), "key");
});

test("nonEmpty gives nothing for blank text or anything that is not a string", () => {
	for (const value of ["", "  ", "\t\n", undefined, null, 7, true, {}, ["a"]])
		assert.equal(nonEmpty(value), undefined);
});
