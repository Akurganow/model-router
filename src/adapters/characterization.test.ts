// Checks the Jev suffix of the decision line the Claude Code adapter logs, and the line the omp adapter notes for each item.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ROUTING_LIMIT_MS } from "../core/compose.ts";
import { plan } from "../core/provider.ts";
import {
	type Answers,
	FULL,
	FULL_SUFFIX,
	type Once,
	routed,
} from "./claude/fakes.ts";
import { useWorld } from "./omp/fakes.ts";
import type { Batch } from "./omp/gates.ts";
import { type Pending, scoreItems } from "./omp/score.ts";

describe("decision line suffix", () => {
	const line = async (extra: Answers, run: Partial<Once> = {}) =>
		(await routed({ tier: 1, work: 1, ...extra }, run)).logs[0];
	const BASE = "L1 sonnet · medium · p=0.90/0.90";

	test("the Jev model and the token counts follow the probabilities", async () => {
		assert.equal(await line(FULL), `${BASE}${FULL_SUFFIX}`);
	});

	test("usage with one count, or a count that is not a whole number, adds no tokens", async () => {
		assert.equal(await line({ usage: { input_tokens: 5 } }), BASE);
		assert.equal(
			await line({ usage: { input_tokens: 5, output_tokens: 1.5 } }),
			BASE,
		);
	});
});

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
