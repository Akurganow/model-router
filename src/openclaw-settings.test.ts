import assert from "node:assert/strict";
import { test } from "node:test";
import { PLUGIN_ID, readKeys, readSettings } from "./openclaw-settings.ts";
import type { OpenClawConfig } from "./openclaw-types.ts";

const live = (config: Record<string, unknown>): OpenClawConfig => ({
	plugins: { entries: { [PLUGIN_ID]: { config } } },
});

test("the plugin id is the manifest id", () => {
	assert.equal(PLUGIN_ID, "model-router-openclaw");
});

test("without any config the defaults hold and no model is set", () => {
	assert.deepEqual(readSettings(undefined, undefined), {
		provider: "typesafe",
		scope: "core",
		smallModel: undefined,
		largeModel: undefined,
	});
});

test("the live config supplies every setting", () => {
	const config = live({
		provider: "auto",
		scope: "extended",
		small_model: "openai/gpt-5-mini",
		large_model: "anthropic/claude-opus-5-5",
	});
	assert.deepEqual(readSettings(config, undefined), {
		provider: "auto",
		scope: "extended",
		smallModel: "openai/gpt-5-mini",
		largeModel: "anthropic/claude-opus-5-5",
	});
});

test("an unreadable live config falls back to the plugin config", () => {
	assert.equal(
		readSettings(undefined, { provider: "openrouter" }).provider,
		"openrouter",
	);
});

test("the live value wins over the plugin config", () => {
	const settings = readSettings(live({ scope: "core" }), { scope: "extended" });
	assert.equal(settings.scope, "core");
});

test("a setting the live config lacks comes from the plugin config", () => {
	const settings = readSettings(live({ provider: "auto" }), {
		scope: "extended",
		small_model: "a/b",
	});
	assert.deepEqual(
		[settings.provider, settings.scope, settings.smallModel],
		["auto", "extended", "a/b"],
	);
});

test("a provider outside the enumeration counts as the default", () => {
	for (const bad of ["Auto", "both", "", 3, null, {}])
		assert.equal(
			readSettings(live({ provider: bad }), undefined).provider,
			"typesafe",
		);
});

test("a scope outside the enumeration counts as the default", () => {
	for (const bad of ["all", "Extended", "", 1, null])
		assert.equal(readSettings(live({ scope: bad }), undefined).scope, "core");
});

test("a model slot is trimmed, and a blank or non-string slot is unset", () => {
	const set = readSettings(live({ small_model: "  a/b  " }), undefined);
	assert.equal(set.smallModel, "a/b");
	for (const bad of ["", "   ", 5, null, {}, []]) {
		const settings = readSettings(
			live({ small_model: bad, large_model: bad }),
			undefined,
		);
		assert.deepEqual(
			[settings.smallModel, settings.largeModel],
			[undefined, undefined],
		);
	}
});

test("a live config whose plugin entry is not a record falls back", () => {
	const config = { plugins: { entries: { [PLUGIN_ID]: { config: "x" } } } };
	assert.equal(
		readSettings(config as unknown as OpenClawConfig, { scope: "extended" })
			.scope,
		"extended",
	);
});

const ENV = {
	TYPESAFE_API_KEY: "env-ts-key",
	OPENROUTER_API_KEY: "env-or-key",
};

test("keys are read for the allowed providers only", () => {
	const config = live({ api_key: "plug-ts", openrouter_api_key: "plug-or" });
	assert.deepEqual(readKeys(config, undefined, "typesafe", ENV), {
		typesafe: "plug-ts",
	});
	assert.deepEqual(readKeys(config, undefined, "openrouter", ENV), {
		openrouter: "plug-or",
	});
	assert.deepEqual(readKeys(config, undefined, "auto", ENV), {
		typesafe: "plug-ts",
		openrouter: "plug-or",
	});
});

test("a provider value outside the enumeration reads the default provider's key", () => {
	assert.deepEqual(readKeys(undefined, undefined, "bogus", ENV), {
		typesafe: "env-ts-key",
	});
});

test("the plugin key comes before the variable", () => {
	assert.deepEqual(
		readKeys(live({ api_key: "plug-ts" }), undefined, "typesafe", ENV),
		{ typesafe: "plug-ts" },
	);
});

test("the variable supplies a key the plugin lacks", () => {
	assert.deepEqual(readKeys(undefined, undefined, "auto", ENV), {
		typesafe: "env-ts-key",
		openrouter: "env-or-key",
	});
});

test("the plugin config key is used when the live config has none", () => {
	assert.deepEqual(
		readKeys(undefined, { openrouter_api_key: "fallback" }, "openrouter", ENV),
		{ openrouter: "fallback" },
	);
});

test("an empty or non-string key is ignored and the variable applies", () => {
	for (const bad of ["", 7, null, { source: "env" }, ["k"]])
		assert.deepEqual(
			readKeys(live({ api_key: bad }), undefined, "typesafe", ENV),
			{ typesafe: "env-ts-key" },
		);
});

test("an empty variable is no key", () => {
	assert.deepEqual(
		readKeys(undefined, undefined, "auto", { TYPESAFE_API_KEY: "" }),
		{},
	);
});

test("a disallowed provider's key is never read from the environment", () => {
	assert.deepEqual(
		readKeys(undefined, undefined, "typesafe", { OPENROUTER_API_KEY: "x" }),
		{},
	);
});
