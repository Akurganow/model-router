import assert from "node:assert/strict";
import { test } from "node:test";
import {
	KEY,
	lockfileScoped,
	lockfileWith,
	setEnv,
	unreadable,
	useWorld,
} from "#adapters/omp/__tests__/support/fakes.ts";
import { findAttempts, readSettings } from "#adapters/omp/settings.ts";
import { settingsOf } from "#core/options/settings.ts";
import { KEY_VARIABLES } from "#core/providers/provider.ts";

const world = useWorld();

const gives = async () =>
	settingsOf((await readSettings(world.imports, "/work")) ?? {});

test("the adapter passes the stored text of both settings to the core", async () => {
	world.lockfile = lockfileWith({ provider: "auto", gateway: "fast" });
	const stored = await readSettings(world.imports, "/work");
	assert.equal(stored?.provider, "auto");
	assert.equal(stored?.gateway, "fast");
	assert.deepEqual(await gives(), { skipped: "provider not valid: run setup" });
});

test("a global gateway of nothing reads as direct", async () => {
	for (const gateway of ["", "   ", null]) {
		world.lockfile = lockfileWith({ gateway });
		assert.deepEqual(await gives(), {
			provider: "typesafe",
			gateway: "direct",
			scope: "core",
		});
	}
});

const scopes: [string, unknown, unknown, unknown][] = [
	["no value", undefined, undefined, undefined],
	["a global extended", "extended", undefined, "extended"],
	["a project extended over the global core", "core", "extended", "extended"],
	["a project core over the global extended", "extended", "core", "core"],
	["an unknown project value", "extended", "wide", "wide"],
	["an unknown global value", "wide", undefined, "wide"],
];
for (const [name, global, project, applied] of scopes)
	test(`scope: ${name} applies ${String(applied)}`, async () => {
		world.lockfile = lockfileScoped(global);
		if (project !== undefined) world.project = { scope: project };
		assert.equal((await readSettings(world.imports, "/work"))?.scope, applied);
	});

test("an unreadable lockfile or settings read gives no settings", async () => {
	for (const imports of unreadable(world.imports))
		assert.equal(await readSettings(imports, "/work"), undefined);
	world.lockfile = "{ not json";
	assert.equal(await readSettings(world.imports, "/work"), undefined);
});

const ok = (gateway: string) => ({
	provider: "typesafe",
	gateway,
	scope: "core",
});
const provider = { skipped: "provider not valid: run setup" };
const rules: [string, object, object, object][] = [
	[
		"drops auto to direct",
		{ gateway: "auto" },
		{ gateway: "direct" },
		ok("direct"),
	],
	[
		"drops openrouter-first to openrouter",
		{ gateway: "openrouter-first" },
		{ gateway: "openrouter" },
		ok("openrouter"),
	],
	[
		"never adds a path",
		{ gateway: "direct" },
		{ gateway: "auto" },
		ok("direct"),
	],
	[
		"never swaps a path",
		{ gateway: "openrouter" },
		{ gateway: "direct" },
		ok("openrouter"),
	],
	[
		"never reorders paths",
		{ gateway: "auto" },
		{ gateway: "openrouter-first" },
		ok("auto"),
	],
	[
		"never narrows auto for a blank gateway",
		{ gateway: "auto" },
		{ gateway: "" },
		ok("auto"),
	],
	[
		"never narrows auto for a gateway of spaces",
		{ gateway: "auto" },
		{ gateway: "   " },
		ok("auto"),
	],
	[
		"never narrows auto for a null gateway",
		{ gateway: "auto" },
		{ gateway: null },
		ok("auto"),
	],
	[
		"never sets the provider",
		{ provider: "auto" },
		{ provider: "typesafe" },
		provider,
	],
	[
		"skips on a gateway that is not valid",
		{ gateway: "auto" },
		{ gateway: "fast" },
		{ skipped: "gateway not valid: run setup" },
	],
	[
		"skips on a provider that is not valid",
		{ provider: "typesafe" },
		{ provider: "openai" },
		provider,
	],
];
for (const [name, global, project, expected] of rules)
	test(`a project ${name}`, async () => {
		world.lockfile = lockfileWith(global as Record<string, unknown>);
		world.project = project as Record<string, unknown>;
		assert.deepEqual(await gives(), expected);
	});

test("a provider takes its key from omp's credential and the other from the variable", async () => {
	setEnv(KEY_VARIABLES.openrouter, "env-or-key");
	world.credential = async (provider) =>
		provider === "typesafe" ? KEY : undefined;
	const attempts = await findAttempts(world.ctx(), {
		provider: "typesafe",
		gateway: "auto",
	});
	assert.deepEqual(attempts, [
		{
			maker: "typesafe",
			path: "direct",
			holder: "typesafe",
			key: KEY,
			timeout: 5000,
			retries: 0,
		},
		{
			maker: "typesafe",
			path: "openrouter",
			holder: "openrouter",
			key: "env-or-key",
		},
	]);
	assert.deepEqual(world.asked, ["typesafe", "openrouter"]);
});

test("a credential store that throws falls through to the variable and the next provider is still read", async () => {
	setEnv(KEY_VARIABLES.typesafe, "env-ts-key");
	setEnv(KEY_VARIABLES.openrouter, "env-or-key");
	world.credential = async () => {
		throw new Error("store locked");
	};
	const attempts = await findAttempts(world.ctx(), {
		provider: "typesafe",
		gateway: "auto",
	});
	assert.deepEqual(attempts, [
		{
			maker: "typesafe",
			path: "direct",
			holder: "typesafe",
			key: "env-ts-key",
			timeout: 5000,
			retries: 0,
		},
		{
			maker: "typesafe",
			path: "openrouter",
			holder: "openrouter",
			key: "env-or-key",
		},
	]);
	assert.deepEqual(world.asked, ["typesafe", "openrouter"]);
});
