import assert from "node:assert/strict";
import { test } from "node:test";
import { recordingEngine } from "#adapters/claude/__tests__/support/fakes.ts";
import type { Engine, Options } from "#adapters/claude/host.ts";
import { readKeys } from "#adapters/claude/keys.ts";
import {
	type Choice,
	KEY_VARIABLES,
	MAKERS,
} from "#core/providers/provider.ts";

const choice = (gateway: Choice["gateway"]): Choice => ({
	provider: "typesafe",
	gateway,
});

// The host needs a literal name in each $.env.get call, so claude/keys.ts cannot read the table.
// One choice asks the key holders of its maker and OpenRouter, so the choices of every maker together hold them all.
test("the key variables read by name are the ones in the provider table", async () => {
	const { engine, reads } = recordingEngine(() => undefined);
	for (const provider of MAKERS)
		await readKeys(engine, {} as Options, { provider, gateway: "auto" });
	assert.deepEqual(
		[...new Set(reads)].sort(),
		Object.values(KEY_VARIABLES).sort(),
	);
});

const engineWith = (variable: unknown) =>
	({ env: { get: async () => variable } }) as unknown as Engine;

test("a whitespace-only option counts as unset and the variable stands in", async () => {
	const keys = await readKeys(
		engineWith("from-the-variable"),
		{ api_key: " \t\n" } as Options,
		choice("direct"),
	);
	assert.deepEqual(keys, { typesafe: "from-the-variable" });
});

test("a whitespace-only option and variable leave the key unset", async () => {
	const keys = await readKeys(
		engineWith("  "),
		{ api_key: "  " } as Options,
		choice("direct"),
	);
	assert.deepEqual(keys, {});
});

test("a key is sent trimmed, from the option and from the variable", async () => {
	const fromOption = await readKeys(
		engineWith(undefined),
		{ openrouter_api_key: "  or-key \n" } as Options,
		choice("openrouter"),
	);
	assert.deepEqual(fromOption, { openrouter: "or-key" });
	const fromVariable = await readKeys(
		engineWith(" ts-key\t"),
		{} as Options,
		choice("direct"),
	);
	assert.deepEqual(fromVariable, { typesafe: "ts-key" });
});

test("the option comes first, and the variable is read only for a key the option lacks", async () => {
	const { engine, reads } = recordingEngine(() => "env-or");
	const keys = await readKeys(
		engine,
		{ api_key: "opt-ts" } as Options,
		choice("auto"),
	);
	assert.deepEqual(keys, { typesafe: "opt-ts", openrouter: "env-or" });
	assert.deepEqual(reads, [KEY_VARIABLES.openrouter]);
});

test("a rejected variable lookup rejects and stops the later lookups", async () => {
	const { engine, reads } = recordingEngine(() => {
		throw new Error("engine gone");
	});
	await assert.rejects(
		readKeys(engine, {} as Options, choice("auto")),
		/engine gone/,
	);
	assert.deepEqual(reads, [KEY_VARIABLES.typesafe]);
});
