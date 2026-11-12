import assert from "node:assert/strict";
import { test } from "node:test";
import { useWorld } from "./fakes.ts";
import { createExtension } from "./router.ts";

const world = useWorld();
const install = () => createExtension(world.imports)(world.pi);
const SUFFIX = " · jev jev-1.14.0 · 812/9 tok";

type Row = {
	readonly level: 0 | 1 | 2;
	readonly unresolved: readonly string[];
	// What the spawn hook returns as the model, or undefined for no result.
	readonly model: string | readonly string[] | undefined;
	// The notes after the batch line: a skip line, or none.
	readonly after: readonly string[];
};
const PATTERNS = ["prov/parent"];

const ROWS: readonly Row[] = [
	{ level: 0, unresolved: [], model: "@smol:high", after: [] },
	{ level: 0, unresolved: ["@slow"], model: "@smol:high", after: [] },
	{
		level: 0,
		unresolved: ["@smol"],
		model: undefined,
		after: ["model-router task 1: skipped, no @smol model"],
	},
	{ level: 1, unresolved: [], model: ["prov/parent:medium"], after: [] },
	{
		level: 1,
		unresolved: ["@smol"],
		model: ["prov/parent:medium"],
		after: [],
	},
	{
		level: 1,
		unresolved: ["@slow"],
		model: ["prov/parent:medium"],
		after: [],
	},
	{ level: 2, unresolved: [], model: "@slow:medium", after: [] },
	{ level: 2, unresolved: ["@smol"], model: "@slow:medium", after: [] },
	{
		level: 2,
		unresolved: ["@slow"],
		model: undefined,
		after: ["model-router task 1: skipped, no @slow model"],
	},
];

for (const { level, unresolved, model, after } of ROWS)
	test(`level ${level} with ${unresolved.join(" and ") || "both roles"} ${unresolved.length === 0 ? "resolving" : "unresolved"} gives ${JSON.stringify(model)}`, async () => {
		install();
		await world.toolCall("c", { tasks: [{ task: `level${level} work1` }] });
		for (const role of unresolved) world.resolvable.delete(role);
		const result = await world.spawn("c:0", { patterns: PATTERNS });
		assert.deepEqual(result?.model, model);
		assert.deepEqual(world.notes.slice(1), after);
	});

test("the batch line of each level names the role the level takes", async () => {
	install();
	await world.toolCall("c", {
		tasks: [
			{ task: "level0 work1" },
			{ task: "level1 work1" },
			{ task: "level2 work1" },
		],
	});
	assert.equal(
		world.notes[0],
		`model-router task 1: L0 @smol · high · p=0.90/0.90${SUFFIX} | task 2: L1 no change · medium · p=0.90/0.90${SUFFIX} | task 3: L2 @slow · medium · p=0.90/0.90${SUFFIX}`,
	);
});
