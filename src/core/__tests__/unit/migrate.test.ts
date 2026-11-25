/// <reference types="node" />

import assert from "node:assert/strict";
import { test } from "node:test";
import { migrate, SETTINGS_VERSION } from "#core/options/migrate.ts";

test("the ladder has no step yet", () => {
	assert.equal(SETTINGS_VERSION, 0);
});

test("the ladder returns the record as it is, with no change", () => {
	for (const stored of [
		{},
		{ provider: "openai", scope: "core" },
		{ models: "{openai:gpt-6-luna}" },
		{ models: { openai: "a" }, provider: "typesafe" },
	])
		assert.deepEqual(migrate(stored), { stored, changes: [] });
});
