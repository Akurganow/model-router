import assert from "node:assert/strict";
import { test } from "node:test";
import { PLUGIN_ID, readKeys } from "./settings.ts";
import type { OpenClawConfig } from "./types.ts";

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

const STORE = { typesafe: "store-ts", openrouter: "store-or" };
const ENV = { typesafe: "env-ts", openrouter: "env-or" };

// A settings object that records each field read into the trace.
const traced = (trace: string[], fields: Partial<Record<Name, unknown>>) => {
	const settings: Record<string, unknown> = {};
	for (const p of ["typesafe", "openrouter"] as const)
		Object.defineProperty(settings, FIELD[p], {
			enumerable: true,
			get: () => {
				trace.push(`field ${FIELD[p]}`);
				return fields[p];
			},
		});
	return settings;
};

// An environment that answers from the table and records each variable read.
const tracedEnv = (trace: string[], env: Partial<Record<Name, string>>) =>
	new Proxy({} as Record<string, string | undefined>, {
		get: (_, name) => {
			trace.push(`env ${String(name)}`);
			return name === VARIABLE.typesafe ? env.typesafe : env.openrouter;
		},
	});

const live = (config: Record<string, unknown>): OpenClawConfig => ({
	plugins: { entries: { [PLUGIN_ID]: { config } } },
});

type Case = {
	name: string;
	store: Partial<Record<Name, unknown>>;
	env: Partial<Record<Name, string>>;
	key: (p: Name) => string | undefined;
	variableRead: (p: Name) => boolean;
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
		store: { typesafe: " \t", openrouter: "\n" },
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
		test(`${String(value)} with ${c.name} builds the keys and reads in order`, () => {
			const trace: string[] = [];
			const keys = readKeys(
				live(traced(trace, c.store)),
				undefined,
				value,
				tracedEnv(trace, c.env),
			);
			const expected: Record<string, string> = {};
			const reads: string[] = [];
			for (const p of providers) {
				reads.push(`field ${FIELD[p]}`);
				if (c.variableRead(p)) reads.push(`env ${VARIABLE[p]}`);
				const key = c.key(p);
				if (key !== undefined) expected[p] = key;
			}
			assert.deepEqual(keys, expected);
			assert.deepEqual(
				Object.keys(keys),
				providers.filter((p) => c.key(p) !== undefined),
			);
			assert.deepEqual(trace, reads);
		});

test("the live config is read before the plugin config, and the variable last", () => {
	const trace: string[] = [];
	const keys = readKeys(
		live(traced(trace, {})),
		traced(trace, {}),
		"typesafe",
		tracedEnv(trace, ENV),
	);
	assert.deepEqual(keys, { typesafe: "env-ts" });
	assert.deepEqual(trace, [
		"field api_key",
		"field api_key",
		`env ${VARIABLE.typesafe}`,
	]);
});

test("a key in the live config stops the lookup before the plugin config", () => {
	const trace: string[] = [];
	const keys = readKeys(
		live(traced(trace, STORE)),
		traced(trace, { typesafe: "plugin-ts" }),
		"typesafe",
		tracedEnv(trace, ENV),
	);
	assert.deepEqual(keys, { typesafe: "store-ts" });
	assert.deepEqual(trace, ["field api_key"]);
});

test("a provider takes its key from the store and the other from the variable", () => {
	const trace: string[] = [];
	const keys = readKeys(
		live(traced(trace, { typesafe: "store-ts" })),
		undefined,
		"auto",
		tracedEnv(trace, ENV),
	);
	assert.deepEqual(keys, { typesafe: "store-ts", openrouter: "env-or" });
	assert.deepEqual(trace, [
		"field api_key",
		"field openrouter_api_key",
		`env ${VARIABLE.openrouter}`,
	]);
});
