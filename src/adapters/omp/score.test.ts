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
const TARGETS = ["@smol", "middle model unset", "@slow"];
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

type Unset = {
	readonly level: Level;
	readonly role: "@smol" | "@midl" | "@slow";
	// What the spawn hook returns as the model, and the notes after the batch line.
	readonly model: string | readonly string[] | undefined;
	readonly after: readonly string[];
};

// Each level needs its own role only. A role that stops resolving before the spawn keeps the spawn's patterns and its effort.
const UNSET: readonly Unset[] = [
	{
		level: 0,
		role: "@smol",
		model: ["prov/parent:high"],
		after: [
			`model-router task 1: L0 small model unset · high · p=0.90/0.90${SUFFIX}`,
		],
	},
	{
		level: 1,
		role: "@midl",
		model: ["prov/parent:medium"],
		after: [
			`model-router task 1: L1 middle model unset · medium · p=0.90/0.90${SUFFIX}`,
		],
	},
	{
		level: 2,
		role: "@slow",
		model: ["prov/parent:medium"],
		after: [
			`model-router task 1: L2 large model unset · medium · p=0.90/0.90${SUFFIX}`,
		],
	},
	{ level: 1, role: "@smol", model: "@midl:medium", after: [] },
	{ level: 1, role: "@slow", model: "@midl:medium", after: [] },
	{ level: 2, role: "@smol", model: "@slow:medium", after: [] },
];

for (const { level, role, model, after } of UNSET)
	test(`level ${level} with ${role} not resolved at the spawn gives ${JSON.stringify(model)}`, async () => {
		install();
		world.config.modelRoles = {
			smol: "prov/small",
			midl: "prov/mid",
			slow: "prov/large",
		};
		world.resolvable.add("@midl");
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
		).map(({ stored }) => ({ level: stored.routed?.level, line: stored.line }));
	};

	test("level 0 names @smol, level 1 names its unset slot and level 2 names @slow", async () => {
		assert.deepEqual(await lines([["level0 a"], ["level1 b"], ["level2 c"]]), [
			{ level: 0, line: `L0 @smol · high · p=0.90/0.90${SUFFIX}` },
			{
				level: 1,
				line: `L1 middle model unset · medium · p=0.90/0.90${SUFFIX}`,
			},
			{ level: 2, line: `L2 @slow · medium · p=0.90/0.90${SUFFIX}` },
		]);
	});

	test("a set middle slot gives level 1 its role", async () => {
		const middle = batch(world.agents);
		const facts = {
			...middle.facts,
			models: {
				...middle.facts.models,
				middle: { state: "set", model: "@midl" },
			},
		} as const;
		const [scored] = await scoreItems(
			[{ index: 0, item: { task: "level1 b" }, agent: "task" }],
			"",
			{ ...middle, facts },
			ROUTING_LIMIT_MS,
		);
		assert.equal(
			scored?.stored.line,
			`L1 @midl · medium · p=0.90/0.90${SUFFIX}`,
		);
	});

	test("an item the check skips sends nothing and carries its reason", async () => {
		assert.deepEqual(await lines([["level2 a", "reviewer"]]), [
			{
				level: undefined,
				line: "skipped, reviewer is outside the core scope",
			},
		]);
		assert.deepEqual(world.sent, []);
	});
});
