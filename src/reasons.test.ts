import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
	CONFIG_EFFORT,
	LEVEL_SLOTS,
	modelUnresolved,
	modelUnset,
	NO_END_MODEL,
	NODE_NOT_FOUND,
	SLOTS,
	SUBAGENT_MODEL_SET,
	slotForLevel,
} from "./reasons.ts";

test("the shared reasons keep the texts the harnesses print", () => {
	assert.equal(CONFIG_EFFORT, "config effort");
	assert.equal(SUBAGENT_MODEL_SET, "subagent model set");
	assert.equal(NO_END_MODEL, "no small or large model");
	assert.equal(NODE_NOT_FOUND, "node not found");
	assert.equal(modelUnset("small"), "small model unset");
	assert.equal(modelUnset("large"), "large model unset");
	assert.equal(modelUnresolved("small"), "small model unresolved");
	assert.equal(modelUnresolved("large"), "large model unresolved");
});

test("level 0 names the small slot, level 2 the large slot, and the middle none", () => {
	assert.deepEqual(LEVEL_SLOTS, { 0: "small", 2: "large" });
	assert.deepEqual(Object.values(LEVEL_SLOTS), [...SLOTS]);
});

test("slotForLevel gives the end levels their slot and the middle level none", () => {
	assert.equal(slotForLevel(0), "small");
	assert.equal(slotForLevel(1), null);
	assert.equal(slotForLevel(2), "large");
});

test("no other source file spells a shared reason", () => {
	const texts = [
		CONFIG_EFFORT,
		SUBAGENT_MODEL_SET,
		NO_END_MODEL,
		NODE_NOT_FOUND,
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
