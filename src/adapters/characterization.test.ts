// Checks the Jev suffix of the decision line the Claude Code adapter logs, and the line the omp adapter notes for each item.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ROUTING_LIMIT_MS } from "../core/compose.ts";
import { plan } from "../core/provider.ts";
import { FULL_SUFFIX } from "./claude/fakes.ts";
import { useWorld } from "./omp/fakes.ts";
import type { Batch } from "./omp/gates.ts";
import { type Pending, scoreItems } from "./omp/score.ts";

describe("omp per-item line", () => {
	const world = useWorld();
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
			{ role: "@smol", line: `L0 @smol · high · p=0.90/0.90${FULL_SUFFIX}` },
			{
				role: undefined,
				line: `L1 no change · medium · p=0.90/0.90${FULL_SUFFIX}`,
			},
			{ role: "@slow", line: `L2 @slow · medium · p=0.90/0.90${FULL_SUFFIX}` },
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
