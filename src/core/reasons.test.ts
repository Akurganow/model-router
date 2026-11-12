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
	modelUnresolved,
	modelUnset,
	NO_END_MODEL,
	outsideCoreScope,
	SUBAGENT_MODEL_SET,
	setsOwnModel,
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
