import assert from "node:assert/strict";
import { test } from "node:test";
import { lockfileScoped, useWorld } from "./fakes.ts";
import { narrow, readSettings } from "./settings.ts";

const world = useWorld();
const throws = () => {
	throw new Error("boom");
};
const unreadable = () => [
	{ ...world.imports, getPluginSettings: async () => throws() },
	{ ...world.imports, getPluginsLockfile: throws },
];

test("one read gives the provider and the scope", async () => {
	assert.deepEqual(await readSettings(world.imports, "/work"), {
		provider: "typesafe",
		scope: "core",
	});
	world.lockfile = {
		plugins: {},
		settings: { "model-router-omp": { provider: "auto", scope: "extended" } },
	};
	assert.deepEqual(await readSettings(world.imports, "/work"), {
		provider: "auto",
		scope: "extended",
	});
});

const scopes: [string, unknown, unknown, string][] = [
	["no value", undefined, undefined, "core"],
	["a global extended", "extended", undefined, "extended"],
	["a project extended over the global core", "core", "extended", "extended"],
	["a project core over the global extended", "extended", "core", "core"],
	["an unknown project value", "extended", "wide", "core"],
	["an unknown global value", "wide", undefined, "core"],
];
for (const [name, global, project, scope] of scopes)
	test(`scope: ${name} gives ${scope}`, async () => {
		world.lockfile = lockfileScoped(global);
		if (project !== undefined) world.project = { scope: project };
		assert.equal((await readSettings(world.imports, "/work"))?.scope, scope);
	});

test("an unreadable lockfile or settings read gives no settings", async () => {
	for (const imports of unreadable())
		assert.equal(await readSettings(imports, "/work"), undefined);
	world.lockfile = "{ not json";
	assert.equal(await readSettings(world.imports, "/work"), undefined);
});

test("a project only narrows auto or openrouter-first to one provider", () => {
	const projects = [
		"auto",
		"openrouter-first",
		"typesafe",
		"openrouter",
		"unknown",
		undefined,
	];
	const ORF = "openrouter-first";
	const table: [unknown, string[]][] = [
		["auto", ["auto", "auto", "typesafe", "openrouter", "auto", "auto"]],
		[ORF, [ORF, ORF, "typesafe", "openrouter", ORF, ORF]],
		["typesafe", Array(6).fill("typesafe")],
		["openrouter", Array(6).fill("openrouter")],
		["unknown", Array(6).fill("typesafe")],
		[undefined, Array(6).fill("typesafe")],
	];
	for (const [global, expected] of table)
		projects.forEach((project, i) => {
			assert.equal(
				narrow(global, project),
				expected[i],
				`${String(global)} narrowed by ${String(project)}`,
			);
		});
});
