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
import {
	findAttempts,
	findKey,
	readGlobalSettings,
	readSettings,
} from "#adapters/omp/settings.ts";
import type { Context } from "#adapters/omp/types.ts";
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

test("models passes from the global settings, and a project's never applies", async () => {
	world.lockfile = lockfileWith({ models: "{typesafe:jev-preview}" });
	world.project = { models: "{typesafe:jev-1.14.0}" };
	assert.equal(
		(await readSettings(world.imports, "/work"))?.models,
		"{typesafe:jev-preview}",
	);
	assert.equal(
		(await readGlobalSettings(world.imports))?.models,
		"{typesafe:jev-preview}",
	);
	world.lockfile = lockfileWith({});
	assert.equal((await readSettings(world.imports, "/work"))?.models, undefined);
});

test("a global gateway of nothing reads as direct", async () => {
	for (const gateway of ["", "   ", null]) {
		world.lockfile = lockfileWith({ gateway });
		assert.deepEqual(await gives(), {
			provider: "typesafe",
			gateway: "direct",
			scope: "core",
			models: {},
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
	models: {},
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
		{ provider: "mistral" },
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

// findKey takes the result of omp's lookup as it comes. The rule names no key holder, so one holder stands for all.
// The cast lets a row hand findKey the null that omp's types forbid.
const lookedUp = (result: unknown): Context => ({
	...world.ctx(),
	modelRegistry: {
		getApiKeyWithCredentialForProvider: async () =>
			result as { apiKey: string } | undefined,
	},
});

const keyRows: [string, unknown, string | undefined, string | undefined][] = [
	[
		"an API key is kept, trimmed",
		{ apiKey: " stored-key " },
		undefined,
		"stored-key",
	],
	[
		"an API key wins over the variable",
		{ apiKey: "stored-key" },
		"env-key",
		"stored-key",
	],
	["no result falls to the variable", undefined, "env-key", "env-key"],
	["a null result falls to the variable", null, "env-key", "env-key"],
	["an empty key falls to the variable", { apiKey: "" }, "env-key", "env-key"],
	[
		"a key of spaces falls to the variable",
		{ apiKey: "   " },
		"env-key",
		"env-key",
	],
	["a null key falls to the variable", { apiKey: null }, "env-key", "env-key"],
	[
		"no result and no variable gives undefined",
		undefined,
		undefined,
		undefined,
	],
	[
		"a key of spaces and no variable gives undefined",
		{ apiKey: "   " },
		undefined,
		undefined,
	],
	[
		"an OAuth login counts as no key and falls to the variable",
		{ apiKey: "session-token", oauthAccess: "session-token" },
		"env-key",
		"env-key",
	],
	[
		"an OAuth login and no variable gives undefined",
		{ apiKey: "session-token", oauthAccess: "session-token" },
		undefined,
		undefined,
	],
];
for (const [name, result, variable, expected] of keyRows)
	test(`findKey: ${name}`, async () => {
		setEnv(KEY_VARIABLES.typesafe, variable);
		assert.equal(await findKey(lookedUp(result), "typesafe"), expected);
	});

test("findKey: a lookup that throws falls to the variable", async () => {
	setEnv(KEY_VARIABLES.typesafe, "env-key");
	const ctx = {
		...world.ctx(),
		modelRegistry: {
			getApiKeyWithCredentialForProvider: async () => {
				throw new Error("store locked");
			},
		},
	};
	assert.equal(await findKey(ctx, "typesafe"), "env-key");
});
