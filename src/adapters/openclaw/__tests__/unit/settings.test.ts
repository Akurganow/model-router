import assert from "node:assert/strict";
import { test } from "node:test";
import {
	createFakeApi,
	traced,
	tracedEnv,
} from "#adapters/openclaw/__tests__/support/fakes.ts";
import {
	PLUGIN_ID,
	pluginEntry,
	readKeys,
	readSettings,
	readState,
	withPluginSetting,
} from "#adapters/openclaw/settings.ts";
import type { OpenClawConfig } from "#adapters/openclaw/types.ts";
import { settingsOf } from "#core/options/settings.ts";
import {
	type Choice,
	type Gateway,
	KEY_VARIABLES,
} from "#core/providers/provider.ts";

const live = (config: Record<string, unknown>): OpenClawConfig => ({
	plugins: { entries: { [PLUGIN_ID]: { config } } },
});

test("the plugin id is the manifest id", () => {
	assert.equal(PLUGIN_ID, "model-router-openclaw");
});

test("without any config the defaults hold and no model is set", () => {
	assert.deepEqual(readSettings(undefined, undefined), {
		stored: { provider: undefined, gateway: undefined, scope: undefined },
		models: { small: undefined, middle: undefined, large: undefined },
	});
});

test("the live config supplies every setting", () => {
	const config = live({
		provider: "typesafe",
		gateway: "auto",
		scope: "extended",
		small_model: "openai/gpt-5-mini",
		middle_model: "openai/gpt-5",
		large_model: "anthropic/claude-opus-5-5",
	});
	assert.deepEqual(readSettings(config, undefined), {
		stored: { provider: "typesafe", gateway: "auto", scope: "extended" },
		models: {
			small: "openai/gpt-5-mini",
			middle: "openai/gpt-5",
			large: "anthropic/claude-opus-5-5",
		},
	});
});

test("an unreadable live config falls back to the plugin config", () => {
	assert.equal(
		readSettings(undefined, { gateway: "openrouter" }).stored.gateway,
		"openrouter",
	);
});

test("the live value wins over the plugin config", () => {
	const settings = readSettings(live({ scope: "core" }), { scope: "extended" });
	assert.equal(settings.stored.scope, "core");
});

test("a setting the live config lacks comes from the plugin config", () => {
	const settings = readSettings(live({ gateway: "auto" }), {
		scope: "extended",
		small_model: "a/b",
	});
	assert.deepEqual(
		[settings.stored.gateway, settings.stored.scope, settings.models.small],
		["auto", "extended", "a/b"],
	);
});

test("an unusable live model falls through to the plugin config value", () => {
	const settings = readSettings(
		live({
			small_model: "  ",
			middle_model: "",
			large_model: 5,
		}),
		{
			small_model: "a/b",
			middle_model: "e/f",
			large_model: "c/d",
		},
	);
	assert.deepEqual(settings.models, {
		small: "a/b",
		middle: "e/f",
		large: "c/d",
	});
});

test("when no source holds a usable model it is unset", () => {
	const settings = readSettings(live({ small_model: "" }), {
		small_model: null,
	});
	assert.equal(settings.models.small, undefined);
});

test("a model slot is trimmed, for every slot", () => {
	const set = readSettings(
		live({
			small_model: "  a/b  ",
			middle_model: "  c/d  ",
			large_model: "  e/f  ",
		}),
		undefined,
	);
	assert.deepEqual(set.models, { small: "a/b", middle: "c/d", large: "e/f" });
});

test("a blank or non-string slot is unset, for every slot", () => {
	for (const bad of ["", "   ", 5, null, {}, []]) {
		const settings = readSettings(
			live({ small_model: bad, middle_model: bad, large_model: bad }),
			undefined,
		);
		assert.deepEqual(settings.models, {
			small: undefined,
			middle: undefined,
			large: undefined,
		});
	}
});

test("a live config whose plugin entry is not a record falls back", () => {
	const config = { plugins: { entries: { [PLUGIN_ID]: { config: "x" } } } };
	assert.equal(
		readSettings(config as unknown as OpenClawConfig, { scope: "extended" })
			.stored.scope,
		"extended",
	);
});

test("the first source that holds text decides, valid or not, and a silent one lets the next decide", () => {
	const provider = readSettings(live({ provider: "auto" }), {
		provider: "typesafe",
	}).stored;
	assert.equal(provider.provider, "auto");
	const gateway = (liveValue: unknown) =>
		readSettings(live({ gateway: liveValue }), { gateway: "auto" }).stored
			.gateway;
	assert.equal(gateway("fast"), "fast");
	assert.equal(gateway(undefined), "auto");
});

test("a blank or missing gateway is silent: the next source is read, else it reads as direct", () => {
	for (const silent of ["", "   ", null]) {
		const from = readSettings(live({ gateway: silent }), { gateway: "auto" });
		assert.equal(from.stored.gateway, "auto");
		assert.deepEqual(
			settingsOf(readSettings(live({ gateway: silent }), {}).stored),
			{
				provider: "typesafe",
				gateway: "direct",
				scope: "core",
			},
		);
	}
});

const choice = (gateway: Gateway): Choice => ({
	provider: "typesafe",
	gateway,
});

const ENV = {
	TYPESAFE_API_KEY: "env-ts-key",
	OPENROUTER_API_KEY: "env-or-key",
};

test("keys are read for the allowed providers only", () => {
	const config = live({ api_key: "plug-ts", openrouter_api_key: "plug-or" });
	assert.deepEqual(readKeys(config, undefined, choice("direct"), ENV), {
		typesafe: "plug-ts",
	});
	assert.deepEqual(readKeys(config, undefined, choice("openrouter"), ENV), {
		openrouter: "plug-or",
	});
	assert.deepEqual(readKeys(config, undefined, choice("auto"), ENV), {
		typesafe: "plug-ts",
		openrouter: "plug-or",
	});
});

test("a NoChoice looks up no key", () => {
	assert.deepEqual(
		readKeys(
			undefined,
			undefined,
			{ skipped: "gateway not valid: run setup" },
			ENV,
		),
		{},
	);
});

test("the plugin key comes before the variable", () => {
	assert.deepEqual(
		readKeys(live({ api_key: "plug-ts" }), undefined, choice("direct"), ENV),
		{ typesafe: "plug-ts" },
	);
});

test("the variable supplies a key the plugin lacks", () => {
	assert.deepEqual(readKeys(undefined, undefined, choice("auto"), ENV), {
		typesafe: "env-ts-key",
		openrouter: "env-or-key",
	});
});

test("the plugin config key is used when the live config has none", () => {
	assert.deepEqual(
		readKeys(
			undefined,
			{ openrouter_api_key: "fallback" },
			choice("openrouter"),
			ENV,
		),
		{ openrouter: "fallback" },
	);
});

test("an empty or non-string key is ignored and the variable applies", () => {
	for (const bad of ["", 7, null, { source: "env" }, ["k"]])
		assert.deepEqual(
			readKeys(live({ api_key: bad }), undefined, choice("direct"), ENV),
			{ typesafe: "env-ts-key" },
		);
});

test("a blank, spaces or null openai key is unset and the variable stands in", () => {
	const openai: Choice = { provider: "openai", gateway: "direct" };
	for (const bad of ["", "   ", null]) {
		assert.deepEqual(
			readKeys(live({ openai_api_key: bad }), undefined, openai, {
				OPENAI_API_KEY: "env-oa-key",
			}),
			{ openai: "env-oa-key" },
		);
		assert.deepEqual(
			readKeys(live({ openai_api_key: bad }), undefined, openai, {}),
			{},
		);
	}
});

test("a SecretRef in the live config yields to the resolved key in the plugin config", () => {
	const ref = { source: "env", provider: "default", id: "TYPESAFE_API_KEY" };
	assert.deepEqual(
		readKeys(
			live({ api_key: ref }),
			{ api_key: "resolved-key" },
			choice("direct"),
			{},
		),
		{ typesafe: "resolved-key" },
	);
});

test("an empty variable is no key", () => {
	assert.deepEqual(
		readKeys(undefined, undefined, choice("auto"), { TYPESAFE_API_KEY: "" }),
		{},
	);
});

test("a disallowed provider's key is never read from the environment", () => {
	assert.deepEqual(
		readKeys(undefined, undefined, choice("direct"), {
			OPENROUTER_API_KEY: "x",
		}),
		{},
	);
});

test("a blank key or variable is no key, and a padded one is trimmed", () => {
	assert.deepEqual(
		readKeys(live({ api_key: "  " }), undefined, choice("direct"), {
			TYPESAFE_API_KEY: " \t",
		}),
		{},
	);
	assert.deepEqual(
		readKeys(live({ api_key: " plug-ts " }), undefined, choice("direct"), ENV),
		{ typesafe: "plug-ts" },
	);
	assert.deepEqual(
		readKeys(undefined, undefined, choice("direct"), {
			TYPESAFE_API_KEY: " k\n",
		}),
		{ typesafe: "k" },
	);
});

test("the live config is read before the plugin config, and the variable last", () => {
	const trace: string[] = [];
	const keys = readKeys(
		live(traced(trace, {})),
		traced(trace, {}),
		choice("direct"),
		tracedEnv(trace, ENV),
	);
	assert.deepEqual(keys, { typesafe: "env-ts-key" });
	assert.deepEqual(trace, [
		"field api_key",
		"field api_key",
		`env ${KEY_VARIABLES.typesafe}`,
	]);
});

test("openrouter-first looks up the OpenRouter key before the TypeSafe key", () => {
	const trace: string[] = [];
	const keys = readKeys(
		live(traced(trace, {})),
		undefined,
		choice("openrouter-first"),
		tracedEnv(trace, ENV),
	);
	assert.deepEqual(keys, { openrouter: "env-or-key", typesafe: "env-ts-key" });
	assert.deepEqual(trace, [
		"field openrouter_api_key",
		`env ${KEY_VARIABLES.openrouter}`,
		"field api_key",
		`env ${KEY_VARIABLES.typesafe}`,
	]);
});

test("a key in the live config stops the lookup before the plugin config", () => {
	const trace: string[] = [];
	const keys = readKeys(
		live(traced(trace, { typesafe: "live-ts" })),
		traced(trace, { typesafe: "plugin-ts" }),
		choice("direct"),
		tracedEnv(trace, ENV),
	);
	assert.deepEqual(keys, { typesafe: "live-ts" });
	assert.deepEqual(trace, ["field api_key"]);
});

test("a provider takes its key from the live config and the other from the variable", () => {
	const trace: string[] = [];
	const keys = readKeys(
		live(traced(trace, { typesafe: "live-ts" })),
		undefined,
		choice("auto"),
		tracedEnv(trace, ENV),
	);
	assert.deepEqual(keys, { typesafe: "live-ts", openrouter: "env-or-key" });
	assert.deepEqual(trace, [
		"field api_key",
		"field openrouter_api_key",
		`env ${KEY_VARIABLES.openrouter}`,
	]);
});

test("readState reads the live config once and draws the settings and the keys from it", () => {
	const config = live({ gateway: "openrouter", openrouter_api_key: "k" });
	const fake = createFakeApi({ config, pluginConfig: { api_key: "plug" } });
	const state = readState(fake.api, { TYPESAFE_API_KEY: "env" });
	assert.equal(state.config, config);
	assert.deepEqual(state.chosen, {
		provider: "typesafe",
		gateway: "openrouter",
		scope: "core",
	});
	assert.deepEqual(state.keys, { openrouter: "k" });
	assert.equal(fake.runtime.calls.config.length, 1);
});

test("readState falls back to the plugin config and the environment when the live config cannot be read", () => {
	const fake = createFakeApi({ pluginConfig: { gateway: "auto" } });
	fake.runtime.throwOn.add("config");
	const state = readState(fake.api, { OPENROUTER_API_KEY: "env" });
	assert.equal(state.config, undefined);
	assert.deepEqual(state.chosen, {
		provider: "typesafe",
		gateway: "auto",
		scope: "core",
	});
	assert.deepEqual(state.keys, { openrouter: "env" });
});

test("pluginEntry is the plugin's own entry in the config, or nothing", () => {
	const entry = { config: { scope: "core" }, hooks: { timeoutMs: 9000 } };
	const config = {
		plugins: { entries: { other: {}, [PLUGIN_ID]: entry } },
	};
	assert.equal(pluginEntry(config), entry);
	assert.equal(pluginEntry({ plugins: { entries: { other: {} } } }), undefined);
	assert.equal(pluginEntry({}), undefined);
	assert.equal(pluginEntry(undefined), undefined);
});

test("withPluginSetting stores one setting and keeps every other entry and field", () => {
	const draft: OpenClawConfig = {
		plugins: {
			entries: {
				other: { config: { scope: "x" } },
				[PLUGIN_ID]: {
					hooks: { timeoutMs: 9000 },
					config: { provider: "auto" },
				},
			},
		},
	};
	withPluginSetting(draft, "scope", "extended");
	assert.deepEqual(draft, {
		plugins: {
			entries: {
				other: { config: { scope: "x" } },
				[PLUGIN_ID]: {
					hooks: { timeoutMs: 9000 },
					config: { provider: "auto", scope: "extended" },
				},
			},
		},
	});
});

test("withPluginSetting creates the missing path", () => {
	const draft: OpenClawConfig = {};
	withPluginSetting(draft, "provider", "auto");
	assert.deepEqual(draft, {
		plugins: { entries: { [PLUGIN_ID]: { config: { provider: "auto" } } } },
	});
});
