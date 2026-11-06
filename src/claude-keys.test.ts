import assert from "node:assert/strict";
import { test } from "node:test";
import type { Engine, Options } from "./claude-host.ts";
import { readKeys } from "./claude-keys.ts";
import { KEY_VARIABLES } from "./provider.ts";

// The host needs a literal name in each $.env.get call, so claude-keys cannot read the table.
test("the key variables read by name are the ones in the provider table", async () => {
	const reads: string[] = [];
	const engine = {
		env: {
			get: async (name: string) => {
				reads.push(name);
				return undefined;
			},
		},
	} as unknown as Engine;
	await readKeys(engine, {} as Options, "auto");
	assert.deepEqual(reads.sort(), Object.values(KEY_VARIABLES).sort());
});

const engineWith = (variable: unknown) =>
	({ env: { get: async () => variable } }) as unknown as Engine;

test("a whitespace-only option counts as unset and the variable stands in", async () => {
	const keys = await readKeys(
		engineWith("from-the-variable"),
		{ api_key: " \t\n" } as Options,
		"typesafe",
	);
	assert.deepEqual(keys, { typesafe: "from-the-variable" });
});

test("a whitespace-only option and variable leave the key unset", async () => {
	const keys = await readKeys(
		engineWith("  "),
		{ api_key: "  " } as Options,
		"typesafe",
	);
	assert.deepEqual(keys, {});
});

test("a key is sent trimmed, from the option and from the variable", async () => {
	const fromOption = await readKeys(
		engineWith(undefined),
		{ openrouter_api_key: "  or-key \n" } as Options,
		"openrouter",
	);
	assert.deepEqual(fromOption, { openrouter: "or-key" });
	const fromVariable = await readKeys(
		engineWith(" ts-key\t"),
		{} as Options,
		"typesafe",
	);
	assert.deepEqual(fromVariable, { typesafe: "ts-key" });
});
