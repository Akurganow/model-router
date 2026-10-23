/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";
import {
	APIConnectionError,
	APIError,
	APITimeoutError,
	APIUserAbortError,
	TypeSafeError,
} from "@typesafe-ai/sdk";
import { LIMIT_REACHED } from "./compose.ts";
import {
	FIRST_ATTEMPT_TIMEOUT_MS,
	fallsBack,
	HOSTS,
	narrow,
	order,
	PROVIDER_VALUES,
	plan,
} from "./provider.ts";

const T = { provider: "typesafe", model: "jev-latest" };
const O = { provider: "openrouter", model: "jev-latest" };
const FIRST = { timeout: 2000, retry: { maxRetries: 0 } };

const NONE = { typesafe: false, openrouter: false };
const TS = { typesafe: true, openrouter: false };
const OR = { typesafe: false, openrouter: true };
const BOTH = { typesafe: true, openrouter: true };

test("exports four values, two hosts and a 2000 ms first attempt", () => {
	assert.deepEqual(PROVIDER_VALUES, [
		"auto",
		"openrouter-first",
		"typesafe",
		"openrouter",
	]);
	assert.deepEqual(HOSTS, {
		typesafe: "https://api.typesafe.ai",
		openrouter: "https://openrouter.ai/api",
	});
	assert.equal(FIRST_ATTEMPT_TIMEOUT_MS, 2000);
});

test("plan orders the attempts for each value and set of keys", () => {
	const table: [unknown, Record<string, unknown[]>][] = [
		["auto", { NONE: [], TS: [T], OR: [O], BOTH: [{ ...T, ...FIRST }, O] }],
		[
			"openrouter-first",
			{ NONE: [], TS: [T], OR: [O], BOTH: [{ ...O, ...FIRST }, T] },
		],
		["typesafe", { NONE: [], TS: [T], OR: [], BOTH: [T] }],
		["openrouter", { NONE: [], TS: [], OR: [O], BOTH: [O] }],
		["unknown", { NONE: [], TS: [T], OR: [], BOTH: [T] }],
		[undefined, { NONE: [], TS: [T], OR: [], BOTH: [T] }],
	];
	const keys = { NONE, TS, OR, BOTH };
	for (const [value, expected] of table)
		for (const [name, present] of Object.entries(keys))
			assert.deepEqual(
				plan(value, present),
				expected[name],
				`${String(value)} with ${name}`,
			);
});

test("order lists the providers a value allows, without keys", () => {
	assert.deepEqual(order("auto"), ["typesafe", "openrouter"]);
	assert.deepEqual(order("openrouter-first"), ["openrouter", "typesafe"]);
	assert.deepEqual(order("openrouter"), ["openrouter"]);
	assert.deepEqual(order("toString"), ["typesafe"]);
});

test("falls back after a connection error, a timeout and the listed statuses", () => {
	const fallBack = [
		new APIConnectionError(),
		new APITimeoutError(FIRST_ATTEMPT_TIMEOUT_MS),
		...[401, 402, 403, 404, 408, 429, 500, 503, 599].map(
			(status) => new APIError(status, undefined, new Headers()),
		),
	];
	for (const err of fallBack) assert.equal(fallsBack(err), true, String(err));
});

test("does not fall back after 400, 422, an abort or a non-API error", () => {
	const stay = [
		...[400, 422].map(
			(status) => new APIError(status, undefined, new Headers()),
		),
		new APIUserAbortError(),
		new APIUserAbortError(undefined, { cause: LIMIT_REACHED }),
		new TypeSafeError("rejected"),
		new TypeError("boom"),
		LIMIT_REACHED,
	];
	for (const err of stay) assert.equal(fallsBack(err), false, String(err));
});

test("a project only narrows auto or openrouter-first to one provider", () => {
	const projects = [
		"auto",
		"openrouter-first",
		"typesafe",
		"openrouter",
		"unknown",
		undefined,
	];
	const ORF = "openrouter-first";
	const table: [unknown, string[]][] = [
		["auto", ["auto", "auto", "typesafe", "openrouter", "auto", "auto"]],
		[ORF, [ORF, ORF, "typesafe", "openrouter", ORF, ORF]],
		["typesafe", Array(6).fill("typesafe")],
		["openrouter", Array(6).fill("openrouter")],
		["unknown", Array(6).fill("typesafe")],
		[undefined, Array(6).fill("typesafe")],
	];
	for (const [global, expected] of table)
		projects.forEach((project, i) => {
			assert.equal(
				narrow(global, project),
				expected[i],
				`${String(global)} narrowed by ${String(project)}`,
			);
		});
});
