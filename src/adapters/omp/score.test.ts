import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ROUTING_LIMIT_MS } from "../../core/compose.ts";
import { jevAnswer } from "../../core/jev-fakes.ts";
import { effortFor } from "../../core/ladder.ts";
import type { Level } from "../../core/part.ts";
import { batch, useWorld } from "./fakes.ts";
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
				`model-router task 1: L${tier} ${TARGETS[tier]} · ${effortFor(tier, work)} · p=0.90/0.90${SUFFIX}`,
			);
		});

type Unresolved = {
	readonly level: Level;
	readonly role: "@smol" | "@slow";
	// What the spawn hook returns as the model, and the notes after the batch line.
	readonly model: string | readonly string[] | undefined;
	readonly after: readonly string[];
};

// Level 1 changes no model, so it needs neither role; an end level needs its own role only.
const UNRESOLVED: readonly Unresolved[] = [
	{
		level: 0,
		role: "@smol",
		model: undefined,
		after: ["model-router task 1: skipped, no @smol model"],
	},
	{ level: 1, role: "@smol", model: ["prov/parent:medium"], after: [] },
	{ level: 1, role: "@slow", model: ["prov/parent:medium"], after: [] },
	{ level: 2, role: "@smol", model: "@slow:medium", after: [] },
];

for (const { level, role, model, after } of UNRESOLVED)
	test(`level ${level} with ${role} unresolved gives ${JSON.stringify(model)}`, async () => {
		install();
		await world.toolCall("c", { tasks: [{ task: `level${level} work1` }] });
		world.resolvable.delete(role);
		const result = await world.spawn("c:0", { patterns: ["prov/parent"] });
		assert.deepEqual(result?.model, model);
		assert.deepEqual(world.notes.slice(1), after);
	});

test("a skipped item names no effort", async () => {
	install();
	world.credential = async () => undefined;
	await world.toolCall("c", { tasks: [{ task: "level0 work2" }] });
	assert.equal(world.notes[0], "model-router task 1: skipped, key unset");
});

test("a reply whose own body is unusable still scores the item", async () => {
	install();
	world.answer = async () =>
		({
			status: 200,
			statusText: "OK",
			headers: new Headers({ "content-type": "application/json" }),
			text: async () => JSON.stringify(jevAnswer(2, 0)),
			get body(): never {
				throw new Error("Body already used");
			},
		}) as unknown as Response;
	await world.toolCall("c", { tasks: [{ task: "buffered reply" }] });
	assert.equal(
		world.notes[0],
		`model-router task 1: L2 @slow · low · p=0.90/0.90${SUFFIX}`,
	);
});

describe("omp per-item line", () => {
	const lines = async (tasks: [string, string?][]) => {
		const items: Pending[] = tasks.map(([task, agent], index) => ({
			index,
			item: { task },
			agent: agent ?? "task",
		}));
		return (
			await scoreItems(items, "", batch(world.agents), ROUTING_LIMIT_MS)
		).map(({ stored }) => ({ role: stored.routed?.role, line: stored.line }));
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
