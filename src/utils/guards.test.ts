import assert from "node:assert/strict";
import { test } from "node:test";
import { isPositiveNumber, isRecord, isSet } from "./guards.ts";

test("isSet counts text only when it is not blank", () => {
	for (const value of ["", "  ", "\t\n"]) assert.equal(isSet(value), false);
	for (const value of ["x", " x ", "anthropic/claude-x"])
		assert.equal(isSet(value), true);
});

test("isSet counts any other value unless it is null or undefined", () => {
	for (const value of [null, undefined]) assert.equal(isSet(value), false);
	for (const value of [0, false, NaN, {}, [], { primary: "x" }])
		assert.equal(isSet(value), true);
});

test("isRecord accepts objects and arrays but not null or primitives", () => {
	for (const value of [{}, { a: 1 }, []]) assert.equal(isRecord(value), true);
	for (const value of [null, undefined, "x", 0, true])
		assert.equal(isRecord(value), false);
});

test("isPositiveNumber accepts a finite number above 0", () => {
	for (const value of [1, 0.5, 30000, Number.MIN_VALUE])
		assert.equal(isPositiveNumber(value), true);
});

test("isPositiveNumber rejects every other value", () => {
	for (const value of [0, -0, -1, NaN, Infinity, -Infinity])
		assert.equal(isPositiveNumber(value), false);
	for (const value of ["1", null, undefined, true, {}, [], new Number(1)])
		assert.equal(isPositiveNumber(value), false);
});
