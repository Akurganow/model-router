import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ROUTING_LIMIT_MS } from "../../core/compose.ts";
import { effortFor } from "../../core/ladder.ts";
import type { Level } from "../../core/part.ts";
import { plan } from "../../core/provider.ts";
import { useWorld } from "./fakes.ts";
import type { Batch } from "./gates.ts";
import { createExtension } from "./router.ts";
import { type Pending, scoreItems } from "./score.ts";

const world = useWorld();
const install = () => createExtension(world.imports)(world.pi);
const LEVELS: readonly Level[] = [0, 1, 2];
const TARGETS = ["@smol", "no change", "@slow"];
const SUFFIX = " · jev jev-1.14.0 · 812/9 tok";

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

describe("omp per-item line", () => {
	const batch = (): Batch => ({
		attempts: plan("typesafe", { typesafe: true, openrouter: false }),
		keys: { typesafe: "ts-key" },
		facts: {
			scope: "core",
			roles: {},
			overrides: {},
			disabled: [],
			agents: world.agents,
			noModels: undefined,
			maxEffort: undefined,
			effortEnabled: false,
		},
	});
	const lines = async (tasks: [string, string?][]) => {
		const items: Pending[] = tasks.map(([task, agent], index) => ({
			index,
			item: { task },
			agent: agent ?? "task",
		}));
		return (await scoreItems(items, "", batch(), ROUTING_LIMIT_MS)).map(
			({ stored }) => ({ role: stored.routed?.role, line: stored.line }),
		);
	};

	test("level 0 names @smol, level 1 changes nothing and level 2 names @slow", async () => {
		assert.deepEqual(await lines([["level0 a"], ["level1 b"], ["level2 c"]]), [
			{ role: "@smol", line: `L0 @smol · high · p=0.90/0.90${SUFFIX}` },
			{
				role: undefined,
				line: `L1 no change · medium · p=0.90/0.90${SUFFIX}`,
			},
			{ role: "@slow", line: `L2 @slow · medium · p=0.90/0.90${SUFFIX}` },
		]);
	});

	test("an item the check skips sends nothing and carries its reason", async () => {
		assert.deepEqual(await lines([["level2 a", "reviewer"]]), [
			{
				role: undefined,
				line: "skipped, reviewer is outside the core scope",
			},
		]);
		assert.deepEqual(world.sent, []);
	});
});
