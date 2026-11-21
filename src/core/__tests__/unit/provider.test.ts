/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";
import {
	type Choice,
	collectKeys,
	collectKeysSync,
	FIRST_ATTEMPT_TIMEOUT_MS,
	GATEWAYS,
	type Gateway,
	type Maker,
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
const A = {
	maker: "openai",
	path: "direct",
	holder: "openai",
	key: "oa-key",
};
const AO = {
	maker: "openai",
	path: "openrouter",
	holder: "openrouter",
	key: "or-key",
};
const FIRST = { timeout: 5000, retries: 0 };

const NONE = {};
const TS = { typesafe: "ts-key" };
const OR = { openrouter: "or-key" };
const BOTH = { typesafe: "ts-key", openrouter: "or-key" };
const via = (gateway: Gateway, provider: Maker = "typesafe"): Choice => ({
	provider,
	gateway,
});

test("exports four gateway values and a 5000 ms first attempt", () => {
	assert.deepEqual(GATEWAYS, [
		"direct",
		"auto",
		"openrouter-first",
		"openrouter",
	]);
	assert.equal(FIRST_ATTEMPT_TIMEOUT_MS, 5000);
});

test("plan orders the attempts for each gateway and set of keys", () => {
	const table: [Gateway, Record<string, unknown[]>][] = [
		["auto", { NONE: [], TS: [T], OR: [O], BOTH: [{ ...T, ...FIRST }, O] }],
		[
			"openrouter-first",
			{ NONE: [], TS: [T], OR: [O], BOTH: [{ ...O, ...FIRST }, T] },
		],
		["direct", { NONE: [], TS: [T], OR: [], BOTH: [T] }],
		["openrouter", { NONE: [], TS: [], OR: [O], BOTH: [O] }],
	];
	const keys = { NONE, TS, OR, BOTH };
	for (const [gateway, expected] of table)
		for (const [name, present] of Object.entries(keys))
			assert.deepEqual(
				plan(via(gateway), present),
				expected[name],
				`${gateway} with ${name}`,
			);
});

test("plan asks the openai maker on each path, and a typesafe key plans nothing for it", () => {
	const keys = { openai: "oa-key", openrouter: "or-key" };
	const table: [Gateway, unknown[]][] = [
		["auto", [{ ...A, ...FIRST }, AO]],
		["openrouter-first", [{ ...AO, ...FIRST }, A]],
		["direct", [A]],
		["openrouter", [AO]],
	];
	for (const [gateway, expected] of table)
		assert.deepEqual(plan(via(gateway, "openai"), keys), expected, gateway);
	assert.deepEqual(plan(via("auto", "openai"), { typesafe: "ts-key" }), []);
});

test("plan attempts only the providers whose key is set", () => {
	assert.deepEqual(plan(via("auto"), { typesafe: "", openrouter: "or-key" }), [
		O,
	]);
});

const LOOKED_UP = {
	typesafe: "ts-key",
	openai: "oa-key",
	openrouter: "or-key",
};

test("collectKeys awaits each lookup before it starts the next", async () => {
	const trace: string[] = [];
	const keys = await collectKeys(via("openrouter-first"), async (holder) => {
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
	const keys = await collectKeys(via("direct"), async (holder) => {
		asked.push(holder);
		return LOOKED_UP[holder];
	});
	assert.deepEqual(keys, { typesafe: "ts-key" });
	assert.deepEqual(asked, ["typesafe"]);
});

test("collectKeys stops at a rejection and passes it through", async () => {
	const asked: string[] = [];
	await assert.rejects(
		collectKeys(via("auto"), async (holder) => {
			asked.push(holder);
			throw new Error("lookup failed");
		}),
		/lookup failed/,
	);
	assert.deepEqual(asked, ["typesafe"]);
});

test("collectKeys keeps an empty key", async () => {
	const keys = await collectKeys(via("direct"), async () => "");
	assert.deepEqual(keys, { typesafe: "" });
});

test("collectKeysSync looks up the allowed providers in order and leaves out an undefined", () => {
	const trace: string[] = [];
	const keys = collectKeysSync(via("openrouter-first"), (holder) => {
		trace.push(holder);
		return holder === "typesafe" ? undefined : LOOKED_UP[holder];
	});
	assert.deepEqual(keys, { openrouter: "or-key" });
	assert.deepEqual(trace, ["openrouter", "typesafe"]);
});

test("collectKeysSync looks up only the holders of each gateway, in order", () => {
	const looked = (gateway: Gateway, provider: Maker = "typesafe"): string[] => {
		const trace: string[] = [];
		collectKeysSync(via(gateway, provider), (holder) => {
			trace.push(holder);
			return LOOKED_UP[holder];
		});
		return trace;
	};
	assert.deepEqual(looked("direct"), ["typesafe"]);
	assert.deepEqual(looked("auto"), ["typesafe", "openrouter"]);
	assert.deepEqual(looked("openrouter-first"), ["openrouter", "typesafe"]);
	assert.deepEqual(looked("openrouter"), ["openrouter"]);
	assert.deepEqual(looked("direct", "openai"), ["openai"]);
	assert.deepEqual(looked("auto", "openai"), ["openai", "openrouter"]);
	assert.deepEqual(looked("openrouter-first", "openai"), [
		"openrouter",
		"openai",
	]);
	assert.deepEqual(looked("openrouter", "openai"), ["openrouter"]);
});

test("collectKeysSync never looks up a provider the value leaves out", () => {
	const asked: string[] = [];
	const keys = collectKeysSync(via("direct"), (holder) => {
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
			collectKeysSync(via("auto"), (holder) => {
				asked.push(holder);
				throw new Error("lookup failed");
			}),
		/lookup failed/,
	);
	assert.deepEqual(asked, ["typesafe"]);
});

test("collectKeysSync keeps an empty key", () => {
	const keys = collectKeysSync(via("direct"), () => "");
	assert.deepEqual(keys, { typesafe: "" });
});
