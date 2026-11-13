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
	httpStatus,
	KEY_UNSET,
	NETWORK_ERROR,
	outsideCoreScope,
	REJECTED_REQUEST,
	SUBAGENT_MODEL_SET,
	setsOwnModel,
	TIMEOUT,
	UNREADABLE,
} from "./reasons.ts";

// Every shared reason with the text the harnesses print: the constants, then the builders with one argument each.
const CONSTANTS: [string, string][] = [
	[CALLER_EFFORT, "caller effort"],
	[CONFIG_EFFORT, "config effort"],
	[SUBAGENT_MODEL_SET, "subagent model set"],
	[UNREADABLE, "settings unreadable"],
	[KEY_UNSET, "key unset"],
	[BAD_REPLY, "bad reply"],
	[TIMEOUT, "timeout"],
	[FAILED, "failed"],
	[CANCELLED, "cancelled"],
	[NETWORK_ERROR, "network error"],
	[REJECTED_REQUEST, "rejected request"],
];
type Builder = {
	build: (arg: never) => string;
	arg: string | number;
	text: string;
};
const BUILDERS: Builder[] = [
	{
		build: outsideCoreScope,
		arg: "scout",
		text: "scout is outside the core scope",
	},
	{
		build: agentDiscoveryFailed,
		arg: "scout",
		text: "scout agent discovery failed",
	},
	{ build: agentUnknown, arg: "scout", text: "scout agent unknown" },
	{ build: setsOwnModel, arg: "scout", text: "scout sets its own model" },
	{ build: httpStatus, arg: 503, text: "HTTP 503" },
];

// The texts of a slot with no model. pickModel in core/slots.ts computes them, so no source file spells one.
const SLOT_TEXTS = [
	"small model unset",
	"middle model unset",
	"large model unset",
];

test("the shared reasons keep the texts the harnesses print", () => {
	for (const [reason, text] of CONSTANTS) assert.equal(reason, text);
	for (const { build, arg, text } of BUILDERS)
		assert.equal((build as (arg: string | number) => string)(arg), text);
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
		...CONSTANTS.map(([reason]) => reason),
		...[...new Set(BUILDERS.map(({ build }) => build))].flatMap(around),
		...SLOT_TEXTS,
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
