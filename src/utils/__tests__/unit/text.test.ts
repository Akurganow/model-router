import assert from "node:assert/strict";
import { test } from "node:test";
import { nonEmpty, textOf } from "#utils/text.ts";

test("nonEmpty gives a string trimmed", () => {
	assert.equal(nonEmpty("key"), "key");
	assert.equal(nonEmpty("  key \n"), "key");
});

test("nonEmpty gives nothing for blank text or anything that is not a string", () => {
	for (const value of ["", "  ", "\t\n", undefined, null, 7, true, {}, ["a"]])
		assert.equal(nonEmpty(value), undefined);
});

test("textOf gives a text as written and any other value as JSON", () => {
	assert.equal(textOf(" a "), " a ");
	assert.equal(textOf({ a: 1 }), '{"a":1}');
	assert.equal(textOf(5), "5");
	assert.equal(textOf(null), "null");
});

test("textOf never throws for a value JSON cannot hold", () => {
	assert.equal(textOf(undefined), "undefined");
	assert.equal(textOf(10n), "10");
	const loop = { self: undefined as unknown };
	loop.self = loop;
	assert.equal(textOf(loop), "[object Object]");
	const bare: { self?: unknown } = Object.create(null);
	bare.self = bare;
	assert.equal(textOf(bare), "[object Object]");
});
