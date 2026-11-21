/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_SCOPE, SCOPE_VALUES } from "#core/options/scope.ts";

test("exports two values and the core default", () => {
	assert.deepEqual(SCOPE_VALUES, ["core", "extended"]);
	assert.equal(DEFAULT_SCOPE, "core");
});
