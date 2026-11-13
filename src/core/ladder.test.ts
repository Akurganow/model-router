import assert from "node:assert/strict";
import { test } from "node:test";
import { effortFor } from "./ladder.ts";
import type { Level } from "./part.ts";

// The values are written out, not read from the ladder.
const ROWS: readonly (readonly [Level, readonly string[]])[] = [
	[0, ["medium", "high", "xhigh"]],
	[1, ["low", "medium", "high"]],
	[2, ["low", "medium", "high"]],
];

for (const [tier, efforts] of ROWS)
	for (const [work, effort] of efforts.entries())
		test(`tier ${tier} and work ${work} give ${effort}`, () => {
			assert.equal(effortFor(tier, work as Level), effort);
		});
