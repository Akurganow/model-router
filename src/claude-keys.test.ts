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
