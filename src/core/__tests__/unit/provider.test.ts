/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";
import {
	collectKeys,
	collectKeysSync,
	FIRST_ATTEMPT_TIMEOUT_MS,
	order,
	PROVIDER_VALUES,
	parseProvider,
	plan,
} from "#core/providers/provider.ts";

const T = {
	maker: "typesafe",
	path: "direct",
	holder: "typesafe",
	key: "ts-key",
};
const O = {
	maker: "typesafe",
	path: "openrouter",
	holder: "openrouter",
	key: "or-key",
};
const FIRST = { timeout: 2000, retries: 0 };

const NONE = {};
const TS = { typesafe: "ts-key" };
const OR = { openrouter: "or-key" };
const BOTH = { typesafe: "ts-key", openrouter: "or-key" };

test("exports four values and a 2000 ms first attempt", () => {
	assert.deepEqual(PROVIDER_VALUES, [
		"auto",
		"openrouter-first",
		"typesafe",
		"openrouter",
	]);
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
});

test("order lists the providers a value allows, without keys", () => {
	assert.deepEqual(order("auto"), ["typesafe", "openrouter"]);
	assert.deepEqual(order("openrouter-first"), ["openrouter", "typesafe"]);
	assert.deepEqual(order("openrouter"), ["openrouter"]);
	assert.deepEqual(order("toString"), ["typesafe"]);
});

const LOOKED_UP = { typesafe: "ts-key", openrouter: "or-key" };

test("collectKeys awaits each lookup before it starts the next", async () => {
	const trace: string[] = [];
	const keys = await collectKeys("openrouter-first", async (holder) => {
		trace.push(`start ${holder}`);
		await new Promise((resolve) => setTimeout(resolve, 5));
		trace.push(`end ${holder}`);
		return holder === "typesafe" ? undefined : LOOKED_UP[holder];
	});
	assert.deepEqual(keys, { openrouter: "or-key" });
	assert.deepEqual(trace, [
		"start openrouter",
		"end openrouter",
		"start typesafe",
		"end typesafe",
	]);
});

test("collectKeys never looks up a provider the value leaves out", async () => {
	const asked: string[] = [];
	const keys = await collectKeys("typesafe", async (holder) => {
		asked.push(holder);
		return LOOKED_UP[holder];
	});
	assert.deepEqual(keys, { typesafe: "ts-key" });
	assert.deepEqual(asked, ["typesafe"]);
});

test("collectKeys stops at a rejection and passes it through", async () => {
	const asked: string[] = [];
	await assert.rejects(
		collectKeys("auto", async (holder) => {
			asked.push(holder);
			throw new Error("lookup failed");
		}),
		/lookup failed/,
	);
	assert.deepEqual(asked, ["typesafe"]);
});

test("collectKeys keeps an empty key", async () => {
	const keys = await collectKeys("typesafe", async () => "");
	assert.deepEqual(keys, { typesafe: "" });
});

test("collectKeysSync looks up the allowed providers in order and leaves out an undefined", () => {
	const trace: string[] = [];
	const keys = collectKeysSync("openrouter-first", (holder) => {
		trace.push(holder);
		return holder === "typesafe" ? undefined : LOOKED_UP[holder];
	});
	assert.deepEqual(keys, { openrouter: "or-key" });
	assert.deepEqual(trace, ["openrouter", "typesafe"]);
});

test("collectKeysSync never looks up a provider the value leaves out", () => {
	const asked: string[] = [];
	const keys = collectKeysSync("typesafe", (holder) => {
		asked.push(holder);
		return LOOKED_UP[holder];
	});
	assert.deepEqual(keys, { typesafe: "ts-key" });
	assert.deepEqual(asked, ["typesafe"]);
});

test("collectKeysSync stops at a throw and passes it through", () => {
	const asked: string[] = [];
	assert.throws(
		() =>
			collectKeysSync("auto", (holder) => {
				asked.push(holder);
				throw new Error("lookup failed");
			}),
		/lookup failed/,
	);
	assert.deepEqual(asked, ["typesafe"]);
});

test("collectKeysSync keeps an empty key", () => {
	const keys = collectKeysSync("typesafe", () => "");
	assert.deepEqual(keys, { typesafe: "" });
});

test("parseProvider keeps a known value and drops anything else", () => {
	for (const value of PROVIDER_VALUES)
		assert.equal(parseProvider(value), value);
	for (const value of ["", "Auto", "toString", 4, null, undefined, {}])
		assert.equal(parseProvider(value), undefined, String(value));
});
