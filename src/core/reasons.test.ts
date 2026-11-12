import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, sep } from "node:path";
import { test } from "node:test";
import {
	agentDiscoveryFailed,
	agentUnknown,
	BAD_REPLY,
	CALLER_EFFORT,
	CANCELLED,
	CONFIG_EFFORT,
	FAILED,
	KEY_UNSET,
	LEVEL_SLOTS,
	modelForLevel,
	modelUnresolved,
	modelUnset,
	NO_END_MODEL,
	outsideCoreScope,
	SLOTS,
	SUBAGENT_MODEL_SET,
	setsOwnModel,
	slotForLevel,
	TIMEOUT,
	UNREADABLE,
} from "./reasons.ts";

test("the shared reasons keep the texts the harnesses print", () => {
	assert.equal(CALLER_EFFORT, "caller effort");
	assert.equal(CONFIG_EFFORT, "config effort");
	assert.equal(SUBAGENT_MODEL_SET, "subagent model set");
	assert.equal(NO_END_MODEL, "no small or large model");
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

test("modelForLevel keeps the model at the middle level, whatever is set", () => {
	const set = { small: "a/small", large: "a/large" };
	assert.deepEqual(modelForLevel(1, set), { slot: null });
	assert.deepEqual(modelForLevel(1, { small: undefined, large: undefined }), {
		slot: null,
	});
});

test("modelForLevel gives an end level its slot and that slot's model", () => {
	const set = { small: "a/small", large: "a/large" };
	assert.deepEqual(modelForLevel(0, set), { slot: "small", model: "a/small" });
	assert.deepEqual(modelForLevel(2, set), { slot: "large", model: "a/large" });
	assert.deepEqual(modelForLevel(0, { ...set, large: undefined }), {
		slot: "small",
		model: "a/small",
	});
	assert.deepEqual(modelForLevel(2, { ...set, small: undefined }), {
		slot: "large",
		model: "a/large",
	});
});

test("modelForLevel skips an end level whose own slot has no model", () => {
	const set = { small: "a/small", large: "a/large" };
	assert.deepEqual(modelForLevel(0, { ...set, small: undefined }), {
		skipped: "small model unset",
	});
	assert.deepEqual(modelForLevel(2, { ...set, large: undefined }), {
		skipped: "large model unset",
	});
});

// The scan reads every file under src/, so a file in a subfolder cannot spell a reason either.
const SOURCES = join(import.meta.dirname, "..");

// A builder is scanned by the fixed text around its argument.
const MARK = "\u0000";
const around = (build: (arg: never) => string): string[] =>
	(build as (arg: string) => string)(MARK).split(MARK).filter(Boolean);

// Comment lines hold prose, and a one-word text also fills names, so a one-word text counts only as a string literal.
const withoutComments = (code: string): string =>
	code
		.split("\n")
		.filter((line) => !/^\s*(\/\/|\/\*|\*)/.test(line))
		.join("\n");
const spells = (code: string, text: string): boolean =>
	/\s/.test(text)
		? code.includes(text)
		: ['"', "'", "`"].some((quote) => code.includes(quote + text + quote));

test("no other source file spells a shared reason", () => {
	const texts = [
		CALLER_EFFORT,
		CONFIG_EFFORT,
		SUBAGENT_MODEL_SET,
		NO_END_MODEL,
		UNREADABLE,
		KEY_UNSET,
		BAD_REPLY,
		TIMEOUT,
		FAILED,
		CANCELLED,
		...[
			outsideCoreScope,
			agentDiscoveryFailed,
			agentUnknown,
			setsOwnModel,
			modelUnset,
			modelUnresolved,
		].flatMap(around),
	];
	const files = readdirSync(SOURCES, {
		recursive: true,
		encoding: "utf8",
	})
		.map((name) => name.split(sep).join("/"))
		.filter(
			(name) =>
				name.endsWith(".ts") &&
				!name.endsWith(".test.ts") &&
				name !== "core/reasons.ts",
		);
	for (const name of files) {
		const code = withoutComments(readFileSync(join(SOURCES, name), "utf8"));
		for (const text of texts)
			assert.equal(spells(code, text), false, `${name} spells "${text}"`);
	}
});
