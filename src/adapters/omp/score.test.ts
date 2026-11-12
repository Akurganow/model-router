import assert from "node:assert/strict";
import { test } from "node:test";
import { effortFor } from "../../core/ladder.ts";
import type { Level } from "../../core/part.ts";
import { useWorld } from "./fakes.ts";
import { createExtension } from "./router.ts";

const world = useWorld();
const install = () => createExtension(world.imports)(world.pi);
const LEVELS: readonly Level[] = [0, 1, 2];
const TARGETS = ["@smol", "no change", "@slow"];

for (const tier of LEVELS)
	for (const work of LEVELS)
		test(`tier ${tier} and work ${work} give the ladder's ${effortFor(tier, work)}`, async () => {
			install();
			await world.toolCall("c", {
				tasks: [{ task: `level${tier} work${work}` }],
			});
			assert.equal(
				world.notes[0],
				`model-router task 1: L${tier} ${TARGETS[tier]} · ${effortFor(tier, work)} · p=0.90/0.90 · jev jev-1.14.0 · 812/9 tok`,
			);
		});

test("a skipped item names no effort", async () => {
	install();
	world.credential = async () => undefined;
	await world.toolCall("c", { tasks: [{ task: "level0 work2" }] });
	assert.equal(world.notes[0], "model-router task 1: skipped, key unset");
});
