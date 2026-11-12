/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";
import {
	DEFAULT_SCOPE,
	parseScope,
	resolveScope,
	SCOPE_VALUES,
} from "./scope.ts";

test("exports two values and the core default", () => {
	assert.deepEqual(SCOPE_VALUES, ["core", "extended"]);
	assert.equal(DEFAULT_SCOPE, "core");
});

test("resolveScope keeps a known value and maps anything else to core", () => {
	assert.equal(resolveScope("core"), "core");
	assert.equal(resolveScope("extended"), "extended");
	for (const value of ["", "Extended", "toString", 1, null, {}, undefined])
		assert.equal(resolveScope(value), "core", String(value));
});

test("parseScope keeps a known value and drops anything else", () => {
	assert.equal(parseScope("core"), "core");
	assert.equal(parseScope("extended"), "extended");
	for (const value of ["", "Extended", "toString", 1, null, {}, undefined])
		assert.equal(parseScope(value), undefined, String(value));
});
