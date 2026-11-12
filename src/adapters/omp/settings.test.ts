import assert from "node:assert/strict";
import { test } from "node:test";
import { KEY_VARIABLES } from "../../core/provider.ts";
import { KEY, lockfileScoped, setEnv, unreadable, useWorld } from "./fakes.ts";
import { findKeys, narrow, readSettings } from "./settings.ts";

const world = useWorld();

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
	for (const imports of unreadable(world.imports))
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

test("a provider takes its key from omp's credential and the other from the variable", async () => {
	setEnv(KEY_VARIABLES.openrouter, "env-or-key");
	world.credential = async (provider) =>
		provider === "typesafe" ? KEY : undefined;
	const { keys } = await findKeys(world.ctx(), "auto");
	assert.deepEqual(keys, { typesafe: KEY, openrouter: "env-or-key" });
	assert.deepEqual(world.asked, ["typesafe", "openrouter"]);
});

test("a credential store that throws falls through to the variable and the next provider is still read", async () => {
	setEnv(KEY_VARIABLES.typesafe, "env-ts-key");
	setEnv(KEY_VARIABLES.openrouter, "env-or-key");
	world.credential = async () => {
		throw new Error("store locked");
	};
	const { keys } = await findKeys(world.ctx(), "auto");
	assert.deepEqual(keys, { typesafe: "env-ts-key", openrouter: "env-or-key" });
	assert.deepEqual(world.asked, ["typesafe", "openrouter"]);
});
