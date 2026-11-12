import assert from "node:assert/strict";
import { test } from "node:test";
import { KEY_VARIABLES } from "../../core/provider.ts";
import type { Engine, Options } from "./host.ts";
import { readKeys } from "./keys.ts";

// An engine that records each variable read and answers every one the same way.
const recordingEngine = (answer: () => unknown) => {
	const reads: string[] = [];
	const engine = {
		env: {
			get: async (name: string) => {
				reads.push(name);
				return answer();
			},
		},
	} as unknown as Engine;
	return { engine, reads };
};

// The host needs a literal name in each $.env.get call, so claude/keys.ts cannot read the table.
test("the key variables read by name are the ones in the provider table", async () => {
	const { engine, reads } = recordingEngine(() => undefined);
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

test("the option comes first, and the variable is read only for a key the option lacks", async () => {
	const { engine, reads } = recordingEngine(() => "env-or");
	const keys = await readKeys(engine, { api_key: "opt-ts" } as Options, "auto");
	assert.deepEqual(keys, { typesafe: "opt-ts", openrouter: "env-or" });
	assert.deepEqual(reads, [KEY_VARIABLES.openrouter]);
});

test("a rejected variable lookup rejects and stops the later lookups", async () => {
	const { engine, reads } = recordingEngine(() => {
		throw new Error("engine gone");
	});
	await assert.rejects(readKeys(engine, {} as Options, "auto"), /engine gone/);
	assert.deepEqual(reads, [KEY_VARIABLES.typesafe]);
});
