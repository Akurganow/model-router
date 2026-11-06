import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
	CONFIG_EFFORT,
	modelUnresolved,
	modelUnset,
	NO_END_MODEL,
	SUBAGENT_MODEL_SET,
} from "./reasons.ts";

test("the shared reasons keep the texts the harnesses print", () => {
	assert.equal(CONFIG_EFFORT, "config effort");
	assert.equal(SUBAGENT_MODEL_SET, "subagent model set");
	assert.equal(NO_END_MODEL, "no small or large model");
	assert.equal(modelUnset("small"), "small model unset");
	assert.equal(modelUnset("large"), "large model unset");
	assert.equal(modelUnresolved("small"), "small model unresolved");
	assert.equal(modelUnresolved("large"), "large model unresolved");
});

test("no other source file spells a shared reason", () => {
	const texts = [
		CONFIG_EFFORT,
		SUBAGENT_MODEL_SET,
		NO_END_MODEL,
		" model unset",
		" model unresolved",
	];
	const files = readdirSync(import.meta.dirname).filter(
		(name) =>
			name.endsWith(".ts") &&
			!name.endsWith(".test.ts") &&
			name !== "reasons.ts",
	);
	for (const name of files) {
		const code = readFileSync(join(import.meta.dirname, name), "utf8");
		for (const text of texts)
			assert.equal(code.includes(text), false, `${name} spells "${text}"`);
	}
});
