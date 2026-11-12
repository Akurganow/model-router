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
	collectKeysAsync,
	FIRST_ATTEMPT_TIMEOUT_MS,
	fallsBack,
	HOSTS,
	order,
	PROVIDER_VALUES,
	parseProvider,
	plan,
} from "./provider.ts";

const T = { provider: "typesafe", model: "jev-latest" };
const O = { provider: "openrouter", model: "jev-latest" };
const FIRST = { timeout: 2000, retry: { maxRetries: 0 } };

const NONE = {};
const TS = { typesafe: "ts-key" };
const OR = { openrouter: "or-key" };
const BOTH = { typesafe: "ts-key", openrouter: "or-key" };

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

test("plan attempts only the providers whose key is set", () => {
	assert.deepEqual(plan("auto", { typesafe: "", openrouter: "or-key" }), [O]);
	assert.deepEqual(plan("auto", { typesafe: undefined, openrouter: "k" }), [O]);
	assert.deepEqual(plan("auto", { typesafe: false, openrouter: true }), [O]);
});

test("order lists the providers a value allows, without keys", () => {
	assert.deepEqual(order("auto"), ["typesafe", "openrouter"]);
	assert.deepEqual(order("openrouter-first"), ["openrouter", "typesafe"]);
	assert.deepEqual(order("openrouter"), ["openrouter"]);
	assert.deepEqual(order("toString"), ["typesafe"]);
});

const LOOKED_UP = { typesafe: "ts-key", openrouter: "or-key" };

test("collectKeysAsync awaits each lookup before it starts the next", async () => {
	const trace: string[] = [];
	const keys = await collectKeysAsync("openrouter-first", async (provider) => {
		trace.push(`start ${provider}`);
		await new Promise((resolve) => setTimeout(resolve, 5));
		trace.push(`end ${provider}`);
		return provider === "typesafe" ? undefined : LOOKED_UP[provider];
	});
	assert.deepEqual(keys, { openrouter: "or-key" });
	assert.deepEqual(trace, [
		"start openrouter",
		"end openrouter",
		"start typesafe",
		"end typesafe",
	]);
});

test("collectKeysAsync never looks up a provider the value leaves out", async () => {
	const asked: string[] = [];
	const keys = await collectKeysAsync("typesafe", async (provider) => {
		asked.push(provider);
		return LOOKED_UP[provider];
	});
	assert.deepEqual(keys, { typesafe: "ts-key" });
	assert.deepEqual(asked, ["typesafe"]);
});

test("collectKeysAsync stops at a rejection and passes it through", async () => {
	const asked: string[] = [];
	await assert.rejects(
		collectKeysAsync("auto", async (provider) => {
			asked.push(provider);
			throw new Error("lookup failed");
		}),
		/lookup failed/,
	);
	assert.deepEqual(asked, ["typesafe"]);
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

test("parseProvider keeps a known value and drops anything else", () => {
	for (const value of PROVIDER_VALUES)
		assert.equal(parseProvider(value), value);
	for (const value of ["", "Auto", "toString", 4, null, undefined, {}])
		assert.equal(parseProvider(value), undefined, String(value));
});
