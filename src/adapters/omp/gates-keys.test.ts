import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { KEY_VARIABLES, type Provider, plan } from "../../core/provider.ts";
import { KEY_UNSET } from "../../core/reasons.ts";
import { setEnv, useWorld } from "./fakes.ts";
import { openBatch, type Settings } from "./gates.ts";

const world = useWorld();

// The providers each value reads, in the order it reads them.
const VALUES: [string, readonly Provider[]][] = [
	["auto", ["typesafe", "openrouter"]],
	["openrouter-first", ["openrouter", "typesafe"]],
	["typesafe", ["typesafe"]],
	["openrouter", ["openrouter"]],
	["unknown", ["typesafe"]],
];

const STORE = { typesafe: "store-ts", openrouter: "store-or" };
const ENV = { typesafe: "env-ts", openrouter: "env-or" };

// Records each credential lookup and each variable read, in one trace.
function trace(store: Partial<Record<Provider, string>>) {
	const reads: string[] = [];
	const names = new Set(Object.values(KEY_VARIABLES));
	mock.property(
		process,
		"env",
		new Proxy(process.env, {
			get: (target, name) => {
				if (typeof name === "string" && names.has(name))
					reads.push(`env ${name}`);
				return Reflect.get(target, name);
			},
		}),
	);
	world.credential = async (provider) => {
		reads.push(`store ${provider}`);
		return store[provider as Provider];
	};
	return reads;
}

const run = (value: string) =>
	openBatch(world.imports, world.pi, world.ctx(), {
		provider: value,
		scope: "core",
	} as unknown as Settings);

type Case = {
	name: string;
	store: Partial<Record<Provider, string>>;
	env: Partial<Record<Provider, string>>;
	key: (p: Provider) => string | undefined;
	variableRead: (p: Provider) => boolean;
};

const CASES: Case[] = [
	{
		name: "a key in the store",
		store: STORE,
		env: {},
		key: (p) => STORE[p],
		variableRead: () => false,
	},
	{
		name: "a key in the variable",
		store: {},
		env: ENV,
		key: (p) => ENV[p],
		variableRead: () => true,
	},
	{
		name: "a key in both",
		store: STORE,
		env: ENV,
		key: (p) => STORE[p],
		variableRead: () => false,
	},
	{
		name: "a blank store key and variable",
		store: { typesafe: " \n", openrouter: "\t" },
		env: { typesafe: "  ", openrouter: "" },
		key: () => undefined,
		variableRead: () => true,
	},
	{
		name: "no store key and no variable",
		store: {},
		env: {},
		key: () => undefined,
		variableRead: () => true,
	},
];

for (const [value, providers] of VALUES)
	for (const c of CASES)
		test(`${value} with ${c.name} builds the keys and reads in order`, async () => {
			for (const p of ["typesafe", "openrouter"] as const)
				setEnv(KEY_VARIABLES[p], c.env[p]);
			const reads = trace(c.store);
			const result = await run(value);
			const expected: Record<string, string> = {};
			const expectedReads: string[] = [];
			for (const p of providers) {
				expectedReads.push(`store ${p}`);
				if (c.variableRead(p)) expectedReads.push(`env ${KEY_VARIABLES[p]}`);
				const key = c.key(p);
				if (key !== undefined) expected[p] = key;
			}
			if (Object.keys(expected).length === 0)
				assert.deepEqual(result, { closed: KEY_UNSET });
			else {
				assert.ok(!("closed" in result));
				assert.deepEqual(result.keys, expected);
				assert.deepEqual(
					Object.keys(result.keys),
					providers.filter((p) => c.key(p) !== undefined),
				);
				assert.deepEqual(result.attempts, plan(value, expected));
			}
			assert.deepEqual(reads, expectedReads);
		});

test("a provider takes its key from the store and the other from the variable", async () => {
	setEnv(KEY_VARIABLES.openrouter, ENV.openrouter);
	const reads = trace({ typesafe: STORE.typesafe });
	const result = await run("auto");
	assert.ok(!("closed" in result));
	assert.deepEqual(result.keys, {
		typesafe: STORE.typesafe,
		openrouter: ENV.openrouter,
	});
	assert.deepEqual(reads, [
		"store typesafe",
		"store openrouter",
		`env ${KEY_VARIABLES.openrouter}`,
	]);
});

test("a store that throws falls through to the variable and the next provider is still read", async () => {
	setEnv(KEY_VARIABLES.typesafe, ENV.typesafe);
	setEnv(KEY_VARIABLES.openrouter, ENV.openrouter);
	const reads: string[] = [];
	world.credential = async (provider) => {
		reads.push(`store ${provider}`);
		throw new Error("store locked");
	};
	const result = await run("auto");
	assert.ok(!("closed" in result));
	assert.deepEqual(result.keys, ENV);
	assert.deepEqual(reads, ["store typesafe", "store openrouter"]);
});

test("each lookup finishes before the next starts", async () => {
	const order: string[] = [];
	world.credential = async (provider) => {
		order.push(`start ${provider}`);
		await new Promise((resolve) => setTimeout(resolve, 5));
		order.push(`end ${provider}`);
		return `key-${provider}`;
	};
	await run("openrouter-first");
	assert.deepEqual(order, [
		"start openrouter",
		"end openrouter",
		"start typesafe",
		"end typesafe",
	]);
});

test("the attempts follow the value's order for the keys found", async () => {
	trace(STORE);
	const first = await run("openrouter-first");
	assert.ok(!("closed" in first));
	assert.deepEqual(
		first.attempts.map((a) => a.provider),
		["openrouter", "typesafe"],
	);
	assert.deepEqual(Object.keys(first.keys), ["openrouter", "typesafe"]);
	const auto = await run("auto");
	assert.ok(!("closed" in auto));
	assert.deepEqual(
		auto.attempts.map((a) => a.provider),
		["typesafe", "openrouter"],
	);
});
