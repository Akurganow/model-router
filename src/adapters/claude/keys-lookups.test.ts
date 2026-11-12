import assert from "node:assert/strict";
import { test } from "node:test";
import type { Engine, Options } from "./host.ts";
import { readKeys } from "./keys.ts";

const FIELD = {
	typesafe: "api_key",
	openrouter: "openrouter_api_key",
} as const;
const VARIABLE = {
	typesafe: "TYPESAFE_API_KEY",
	openrouter: "OPENROUTER_API_KEY",
} as const;
type Name = keyof typeof FIELD;

// The providers each value reads, in the order it reads them.
const VALUES: [unknown, readonly Name[]][] = [
	["auto", ["typesafe", "openrouter"]],
	["openrouter-first", ["openrouter", "typesafe"]],
	["typesafe", ["typesafe"]],
	["openrouter", ["openrouter"]],
	["unknown", ["typesafe"]],
];

const OPTION = { typesafe: "opt-ts", openrouter: "opt-or" };
const ENV = { typesafe: "env-ts", openrouter: "env-or" };

const options = (key: Record<Name, string> | undefined) =>
	(key === undefined
		? {}
		: {
				[FIELD.typesafe]: key.typesafe,
				[FIELD.openrouter]: key.openrouter,
			}) as Options;

// An engine that answers each variable from the table and records every read.
const engine = (env: Partial<Record<Name, string>>) => {
	const reads: string[] = [];
	const $ = {
		env: {
			get: async (name: string) => {
				reads.push(name);
				return name === VARIABLE.typesafe ? env.typesafe : env.openrouter;
			},
		},
	} as unknown as Engine;
	return { $, reads };
};

type Case = {
	name: string;
	option: Record<Name, string> | undefined;
	env: Partial<Record<Name, string>>;
	// The key each provider ends with, and whether the variable was read for it.
	key: (p: Name) => string | undefined;
	variableRead: (p: Name) => boolean;
};

const CASES: Case[] = [
	{
		name: "a key in the option",
		option: OPTION,
		env: {},
		key: (p) => OPTION[p],
		variableRead: () => false,
	},
	{
		name: "a key in the variable",
		option: undefined,
		env: ENV,
		key: (p) => ENV[p],
		variableRead: () => true,
	},
	{
		name: "a key in both",
		option: OPTION,
		env: ENV,
		key: (p) => OPTION[p],
		variableRead: () => false,
	},
	{
		name: "a blank option and variable",
		option: { typesafe: " \t", openrouter: "\n" },
		env: { typesafe: "  ", openrouter: "" },
		key: () => undefined,
		variableRead: () => true,
	},
	{
		name: "no option and no variable",
		option: undefined,
		env: {},
		key: () => undefined,
		variableRead: () => true,
	},
];

for (const [value, providers] of VALUES)
	for (const c of CASES)
		test(`${String(value)} with ${c.name} builds the keys and reads in order`, async () => {
			const { $, reads } = engine(c.env);
			const keys = await readKeys($, options(c.option), value);
			const expected: Record<string, string> = {};
			for (const p of providers) {
				const key = c.key(p);
				if (key !== undefined) expected[p] = key;
			}
			assert.deepEqual(keys, expected);
			assert.deepEqual(
				Object.keys(keys),
				providers.filter((p) => c.key(p) !== undefined),
			);
			assert.deepEqual(
				reads,
				providers.filter(c.variableRead).map((p) => VARIABLE[p]),
			);
		});

test("a provider takes its key from the option and the other from the variable", async () => {
	const { $, reads } = engine({ openrouter: "env-or" });
	const keys = await readKeys($, { api_key: "opt-ts" } as Options, "auto");
	assert.deepEqual(keys, { typesafe: "opt-ts", openrouter: "env-or" });
	assert.deepEqual(reads, [VARIABLE.openrouter]);
});

test("a key set for a provider the value leaves out is never read", async () => {
	const { $, reads } = engine(ENV);
	const keys = await readKeys($, options(OPTION), "openrouter");
	assert.deepEqual(keys, { openrouter: "opt-or" });
	assert.deepEqual(reads, []);
});

test("a rejected variable lookup rejects and stops the later lookups", async () => {
	const reads: string[] = [];
	const $ = {
		env: {
			get: async (name: string) => {
				reads.push(name);
				throw new Error("engine gone");
			},
		},
	} as unknown as Engine;
	await assert.rejects(readKeys($, {} as Options, "auto"), /engine gone/);
	assert.deepEqual(reads, [VARIABLE.typesafe]);
});

test("each lookup finishes before the next starts", async () => {
	const trace: string[] = [];
	const $ = {
		env: {
			get: async (name: string) => {
				trace.push(`start ${name}`);
				await new Promise((resolve) => setTimeout(resolve, 5));
				trace.push(`end ${name}`);
				return "key";
			},
		},
	} as unknown as Engine;
	await readKeys($, {} as Options, "auto");
	assert.deepEqual(trace, [
		`start ${VARIABLE.typesafe}`,
		`end ${VARIABLE.typesafe}`,
		`start ${VARIABLE.openrouter}`,
		`end ${VARIABLE.openrouter}`,
	]);
});
