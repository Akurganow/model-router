import assert from "node:assert/strict";
import { test } from "node:test";
import { extend } from "./fake-agents.ts";
import { useWorld } from "./fakes.ts";
import { createExtension } from "./router.ts";

const world = useWorld();
const TARGETS = ["@smol", "no change", "@slow"] as const;
const SUFFIX = " · jev jev-1.14.0 · 812/9 tok";
const entry = (level: 0 | 1 | 2, effort: string) =>
	`task 1: L${level} ${TARGETS[level]} · ${effort} · p=0.90/0.90${SUFFIX}`;

type Row = {
	readonly name: string;
	readonly level: 0 | 1 | 2;
	readonly work?: 0 | 1 | 2;
	readonly patterns?: readonly string[];
	readonly roles?: Record<string, unknown>;
	readonly effort?: string;
	readonly enableEffort?: unknown;
	readonly maxEffort?: unknown;
	readonly agent?: string;
	readonly extended?: boolean;
	// What the spawn hook returns as the model, or undefined for no result.
	readonly model: string | readonly string[] | undefined;
	// The effort segment of the batch entry, and of the spawn entry when it differs.
	readonly batch: string;
	readonly spawn?: string;
};

const PLAIN = ["prov/parent"];

const ROWS: readonly Row[] = [
	{
		name: "level 0 sets its role with the effort",
		level: 0,
		patterns: PLAIN,
		model: "@smol:high",
		batch: "high",
	},
	{
		name: "level 1 puts the effort on the spawn's pattern",
		level: 1,
		patterns: PLAIN,
		model: ["prov/parent:medium"],
		batch: "medium",
	},
	{
		name: "level 2 sets its role with the effort",
		level: 2,
		patterns: PLAIN,
		model: "@slow:medium",
		batch: "medium",
	},
	{
		name: "level 0 at work 2 takes xhigh",
		level: 0,
		work: 2,
		patterns: PLAIN,
		model: "@smol:xhigh",
		batch: "xhigh",
	},
	{
		name: "level 2 at work 0 takes low",
		level: 2,
		work: 0,
		patterns: PLAIN,
		model: "@slow:low",
		batch: "low",
	},
	{
		name: "level 0 with no patterns still sets its role",
		level: 0,
		patterns: [],
		model: "@smol:high",
		batch: "high",
	},
	{
		name: "level 1 with no patterns sets nothing and says so",
		level: 1,
		patterns: [],
		model: undefined,
		batch: "medium",
		spawn: "no model patterns",
	},
	{
		name: "level 1 puts the effort on every pattern",
		level: 1,
		patterns: ["prov/a", "prov/b"],
		model: ["prov/a:medium", "prov/b:medium"],
		batch: "medium",
	},
	{
		name: "level 1 keeps a pattern's level",
		level: 1,
		patterns: ["prov/parent:low"],
		model: undefined,
		batch: "medium",
		spawn: "config effort",
	},
	{
		name: "level 1 keeps a pattern's abbreviated level",
		level: 1,
		patterns: ["prov/a", "prov/b:hi"],
		model: undefined,
		batch: "medium",
		spawn: "config effort",
	},
	{
		name: "level 0 sets its effort over a pattern's level, since the role replaces the patterns",
		level: 0,
		patterns: ["prov/parent:xhigh"],
		model: "@smol:high",
		batch: "high",
	},
	{
		name: "level 2 sets its effort over a pattern's auto, since the role replaces the patterns",
		level: 2,
		patterns: ["prov/parent:auto"],
		model: "@slow:medium",
		batch: "medium",
	},
	{
		name: "extended: level 2 sets its effort over a level the scout's smol role puts on its patterns",
		level: 2,
		patterns: ["stub/small:low"],
		roles: { smol: "stub/small:low" },
		extended: true,
		agent: "scout",
		model: "@slow:medium",
		batch: "medium",
	},
	{
		name: "a model id's own colon is no level",
		level: 1,
		patterns: ["prov/m:free"],
		model: ["prov/m:free:medium"],
		batch: "medium",
	},
	{
		name: "a one-letter suffix is no level",
		level: 1,
		patterns: ["prov/m:h"],
		model: ["prov/m:h:medium"],
		batch: "medium",
	},
	{
		name: "level 0 keeps a level on the smol role",
		level: 0,
		patterns: PLAIN,
		roles: { smol: "prov/small:low" },
		model: "@smol",
		batch: "config effort",
	},
	{
		name: "level 2 keeps a level on the slow role",
		level: 2,
		patterns: PLAIN,
		roles: { slow: "prov/large:med" },
		model: "@slow",
		batch: "config effort",
	},
	{
		name: "level 2 keeps a level on a role the slow role names",
		level: 2,
		patterns: PLAIN,
		roles: { slow: "@big", big: "prov/large:high" },
		model: "@slow",
		batch: "config effort",
	},
	{
		name: "level 0 sets the effort on a plain smol role",
		level: 0,
		patterns: PLAIN,
		roles: { smol: "prov/small, prov/other:8b" },
		model: "@smol:high",
		batch: "high",
	},
	{
		name: "level 1 ignores a level on the end roles",
		level: 1,
		patterns: PLAIN,
		roles: { smol: "prov/small:low", slow: "prov/large:low" },
		model: ["prov/parent:medium"],
		batch: "medium",
	},
	{
		name: "level 0 keeps the item's effort",
		level: 0,
		patterns: PLAIN,
		effort: "lo",
		enableEffort: true,
		model: "@smol",
		batch: "caller effort",
	},
	{
		name: "level 1 keeps the item's effort and returns nothing",
		level: 1,
		patterns: PLAIN,
		effort: "hi",
		enableEffort: true,
		model: undefined,
		batch: "caller effort",
	},
	{
		name: "level 2 keeps the item's effort",
		level: 2,
		patterns: PLAIN,
		effort: "med",
		enableEffort: true,
		model: "@slow",
		batch: "caller effort",
	},
	{
		name: "the item's effort wins over a role's level",
		level: 0,
		patterns: PLAIN,
		effort: "lo",
		enableEffort: true,
		roles: { smol: "prov/small:low" },
		model: "@smol",
		batch: "caller effort",
	},
	{
		name: "level 0 sets its effort over the item's effort while omp ignores the field",
		level: 0,
		patterns: PLAIN,
		effort: "hi",
		enableEffort: false,
		model: "@smol:high",
		batch: "high",
	},
	{
		name: "level 1 sets its effort over the item's effort while per-task effort is unset",
		level: 1,
		patterns: PLAIN,
		effort: "lo",
		model: ["prov/parent:medium"],
		batch: "medium",
	},
	{
		name: "an enableEffort that is not true counts as off",
		level: 2,
		patterns: PLAIN,
		effort: "lo",
		enableEffort: "true",
		model: "@slow:medium",
		batch: "medium",
	},
	{
		name: "a ceiling of off keeps omp's effort",
		level: 0,
		patterns: PLAIN,
		maxEffort: "off",
		model: "@smol",
		batch: "config effort",
	},
	{
		name: "a ceiling of minimal keeps omp's effort",
		level: 1,
		patterns: PLAIN,
		maxEffort: "minimal",
		model: undefined,
		batch: "config effort",
	},
	{
		name: "a ceiling of low caps xhigh at low",
		level: 0,
		work: 2,
		patterns: PLAIN,
		maxEffort: "low",
		model: "@smol:low",
		batch: "low",
	},
	{
		name: "a ceiling of low caps level 1 at low",
		level: 1,
		patterns: PLAIN,
		maxEffort: "low",
		model: ["prov/parent:low"],
		batch: "low",
	},
	{
		name: "a ceiling of high caps xhigh at high",
		level: 0,
		work: 2,
		patterns: PLAIN,
		maxEffort: "high",
		model: "@smol:high",
		batch: "high",
	},
	{
		name: "a ceiling of high leaves medium alone",
		level: 2,
		patterns: PLAIN,
		maxEffort: "high",
		model: "@slow:medium",
		batch: "medium",
	},
	{
		name: "a ceiling of xhigh leaves xhigh alone",
		level: 0,
		work: 2,
		patterns: PLAIN,
		maxEffort: "xhigh",
		model: "@smol:xhigh",
		batch: "xhigh",
	},
	{
		name: "omp's default ceiling of max leaves xhigh alone",
		level: 0,
		work: 2,
		patterns: PLAIN,
		maxEffort: "max",
		model: "@smol:xhigh",
		batch: "xhigh",
	},
	{
		name: "a ceiling omp does not know keeps omp's effort",
		level: 0,
		patterns: PLAIN,
		maxEffort: "turbo",
		model: "@smol",
		batch: "config effort",
	},
	{
		name: "extended: a user agent's own level gives way to the ladder",
		level: 2,
		patterns: PLAIN,
		extended: true,
		agent: "constructor",
		model: "@slow:medium",
		batch: "medium",
	},
	{
		name: "extended: a bundled agent's level gives way to the ladder",
		level: 0,
		work: 2,
		patterns: ["prov/small"],
		extended: true,
		agent: "sonic",
		model: "@smol:xhigh",
		batch: "xhigh",
	},
	{
		name: "extended: level 1 keeps a bundled agent's model and sets the effort",
		level: 1,
		patterns: ["prov/small"],
		extended: true,
		agent: "scout",
		model: ["prov/small:medium"],
		batch: "medium",
	},
];

for (const row of ROWS)
	test(row.name, async () => {
		if (row.extended) extend(world);
		if (row.roles) world.config.modelRoles = row.roles;
		if (row.maxEffort !== undefined)
			world.config["task.maxEffort"] = row.maxEffort;
		if (row.enableEffort !== undefined)
			world.config["task.enableEffort"] = row.enableEffort;
		createExtension(world.imports)(world.pi);
		const agent = row.agent ?? "task";
		await world.toolCall("c", {
			tasks: [
				{
					task: `level${row.level} work${row.work ?? 1}`,
					...(row.agent ? { agent } : {}),
					...(row.effort ? { effort: row.effort } : {}),
				},
			],
		});
		const result = await world.spawn("c:0", {
			agent,
			...(row.patterns ? { patterns: row.patterns } : {}),
		});
		const shown = entry(row.level, row.spawn ?? row.batch);
		assert.deepEqual(
			result,
			row.model === undefined
				? undefined
				: {
						model: row.model,
						note: `model-router ${shown.slice("task 1: ".length)}`,
					},
		);
		assert.deepEqual(world.notes, [
			`model-router ${entry(row.level, row.batch)}`,
			...(row.spawn ? [`model-router ${shown}`] : []),
		]);
	});

test("a ceiling lowered after the batch caps the spawn and says so", async () => {
	createExtension(world.imports)(world.pi);
	await world.toolCall("c", { tasks: [{ task: "level0 work2" }] });
	world.config["task.maxEffort"] = "low";
	assert.deepEqual(await world.spawn("c:0", { patterns: PLAIN }), {
		model: "@smol:low",
		note: `model-router L0 @smol · low · p=0.90/0.90${SUFFIX}`,
	});
	assert.deepEqual(world.notes.slice(1), [`model-router ${entry(0, "low")}`]);
});

test("a ceiling omp cannot read keeps omp's effort", async () => {
	const lookup = (id: string) =>
		id === "task.maxEffort"
			? {
					get: () => {
						throw new Error("boom");
					},
				}
			: world.imports.lookup(id);
	createExtension({ ...world.imports, lookup })(world.pi);
	await world.toolCall("c", { tasks: [{ task: "level0" }] });
	assert.equal(world.notes[0], `model-router ${entry(0, "config effort")}`);
	assert.equal((await world.spawn("c:0", { patterns: PLAIN }))?.model, "@smol");
});

test("a gate that closes at spawn skips level 1 too", async () => {
	createExtension(world.imports)(world.pi);
	await world.toolCall("c", { tasks: [{ task: "level1" }] });
	world.config["task.agentModelOverrides"] = { task: "prov/x" };
	assert.equal(await world.spawn("c:0", { patterns: PLAIN }), undefined);
	assert.deepEqual(world.notes.slice(1), [
		"model-router task 1: skipped, task model override set",
	]);
});

test("a gate that closes at spawn skips level 1 with the item's effort too", async () => {
	world.config["task.enableEffort"] = true;
	createExtension(world.imports)(world.pi);
	await world.toolCall("c", { tasks: [{ task: "level1", effort: "hi" }] });
	world.config["task.agentModelOverrides"] = { task: "prov/x" };
	assert.equal(await world.spawn("c:0", { patterns: PLAIN }), undefined);
	assert.deepEqual(world.notes.slice(1), [
		"model-router task 1: skipped, task model override set",
	]);
});

test("per-task effort turned on after the batch keeps the item's effort at spawn and says so", async () => {
	world.config["task.enableEffort"] = false;
	createExtension(world.imports)(world.pi);
	await world.toolCall("c", { tasks: [{ task: "level0", effort: "hi" }] });
	world.config["task.enableEffort"] = true;
	assert.deepEqual(await world.spawn("c:0", { patterns: PLAIN }), {
		model: "@smol",
		note: `model-router L0 @smol · caller effort · p=0.90/0.90${SUFFIX}`,
	});
	assert.deepEqual(world.notes, [
		`model-router ${entry(0, "high")}`,
		`model-router ${entry(0, "caller effort")}`,
	]);
});

test("per-task effort turned off after the batch sets the capped ladder effort at spawn and says so", async () => {
	world.config["task.enableEffort"] = true;
	world.config["task.maxEffort"] = "medium";
	createExtension(world.imports)(world.pi);
	await world.toolCall("c", { tasks: [{ task: "level0", effort: "hi" }] });
	world.config["task.enableEffort"] = false;
	assert.deepEqual(await world.spawn("c:0", { patterns: PLAIN }), {
		model: "@smol:medium",
		note: `model-router L0 @smol · medium · p=0.90/0.90${SUFFIX}`,
	});
	assert.deepEqual(world.notes, [
		`model-router ${entry(0, "caller effort")}`,
		`model-router ${entry(0, "medium")}`,
	]);
});

test("level 1 follows per-task effort turned off after the batch", async () => {
	world.config["task.enableEffort"] = true;
	createExtension(world.imports)(world.pi);
	await world.toolCall("c", { tasks: [{ task: "level1", effort: "lo" }] });
	world.config["task.enableEffort"] = false;
	assert.deepEqual(await world.spawn("c:0", { patterns: PLAIN }), {
		model: ["prov/parent:medium"],
		note: `model-router L1 no change · medium · p=0.90/0.90${SUFFIX}`,
	});
	assert.deepEqual(world.notes.slice(1), [
		`model-router ${entry(1, "medium")}`,
	]);
});

for (const enabled of [true, false])
	test(`per-task effort left ${enabled ? "on" : "off"} prints one line and today's model`, async () => {
		world.config["task.enableEffort"] = enabled;
		createExtension(world.imports)(world.pi);
		await world.toolCall("c", { tasks: [{ task: "level0", effort: "hi" }] });
		const label = enabled ? "caller effort" : "high";
		assert.deepEqual(await world.spawn("c:0", { patterns: PLAIN }), {
			model: enabled ? "@smol" : "@smol:high",
			note: `model-router L0 @smol · ${label} · p=0.90/0.90${SUFFIX}`,
		});
		assert.deepEqual(world.notes, [`model-router ${entry(0, label)}`]);
	});
