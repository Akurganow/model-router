import assert from "node:assert/strict";
import { test } from "node:test";
import {
	KEY_FIELDS,
	KEY_VARIABLES,
	type Provider,
} from "../../core/provider.ts";
import { createFakeApi } from "./fakes.ts";
import {
	PLUGIN_ID,
	pluginEntry,
	readKeys,
	readSettings,
	readState,
	withPluginSetting,
} from "./settings.ts";
import type { OpenClawConfig } from "./types.ts";

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

test("an invalid live value falls through to the valid plugin config value", () => {
	const settings = readSettings(
		live({
			provider: "both",
			scope: "all",
			small_model: "  ",
			large_model: 5,
		}),
		{
			provider: "openrouter",
			scope: "extended",
			small_model: "a/b",
			large_model: "c/d",
		},
	);
	assert.deepEqual(settings, {
		provider: "openrouter",
		scope: "extended",
		smallModel: "a/b",
		largeModel: "c/d",
	});
});

test("when no source holds a valid value the default or unset applies", () => {
	const settings = readSettings(live({ provider: "both", small_model: "" }), {
		provider: 3,
		small_model: null,
	});
	assert.deepEqual(
		[settings.provider, settings.smallModel],
		["typesafe", undefined],
	);
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

test("a SecretRef in the live config yields to the resolved key in the plugin config", () => {
	const ref = { source: "env", provider: "default", id: "TYPESAFE_API_KEY" };
	assert.deepEqual(
		readKeys(
			live({ api_key: ref }),
			{ api_key: "resolved-key" },
			"typesafe",
			{},
		),
		{ typesafe: "resolved-key" },
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

test("a blank key or variable is no key, and a padded one is trimmed", () => {
	assert.deepEqual(
		readKeys(live({ api_key: "  " }), undefined, "typesafe", {
			TYPESAFE_API_KEY: " \t",
		}),
		{},
	);
	assert.deepEqual(
		readKeys(live({ api_key: " plug-ts " }), undefined, "typesafe", ENV),
		{ typesafe: "plug-ts" },
	);
	assert.deepEqual(
		readKeys(undefined, undefined, "typesafe", { TYPESAFE_API_KEY: " k\n" }),
		{ typesafe: "k" },
	);
});

// A settings object that records each key field read into the trace.
const traced = (
	trace: string[],
	fields: Partial<Record<Provider, unknown>>,
) => {
	const settings: Record<string, unknown> = {};
	for (const provider of Object.keys(KEY_FIELDS) as Provider[])
		Object.defineProperty(settings, KEY_FIELDS[provider], {
			enumerable: true,
			get: () => {
				trace.push(`field ${KEY_FIELDS[provider]}`);
				return fields[provider];
			},
		});
	return settings;
};

// An environment that answers from ENV and records each variable read.
const tracedEnv = (trace: string[]) =>
	new Proxy({} as Record<string, string | undefined>, {
		get: (_, name) => {
			trace.push(`env ${String(name)}`);
			return ENV[name as keyof typeof ENV];
		},
	});

test("the live config is read before the plugin config, and the variable last", () => {
	const trace: string[] = [];
	const keys = readKeys(
		live(traced(trace, {})),
		traced(trace, {}),
		"typesafe",
		tracedEnv(trace),
	);
	assert.deepEqual(keys, { typesafe: "env-ts-key" });
	assert.deepEqual(trace, [
		"field api_key",
		"field api_key",
		`env ${KEY_VARIABLES.typesafe}`,
	]);
});

test("a key in the live config stops the lookup before the plugin config", () => {
	const trace: string[] = [];
	const keys = readKeys(
		live(traced(trace, { typesafe: "live-ts" })),
		traced(trace, { typesafe: "plugin-ts" }),
		"typesafe",
		tracedEnv(trace),
	);
	assert.deepEqual(keys, { typesafe: "live-ts" });
	assert.deepEqual(trace, ["field api_key"]);
});

test("a provider takes its key from the live config and the other from the variable", () => {
	const trace: string[] = [];
	const keys = readKeys(
		live(traced(trace, { typesafe: "live-ts" })),
		undefined,
		"auto",
		tracedEnv(trace),
	);
	assert.deepEqual(keys, { typesafe: "live-ts", openrouter: "env-or-key" });
	assert.deepEqual(trace, [
		"field api_key",
		"field openrouter_api_key",
		`env ${KEY_VARIABLES.openrouter}`,
	]);
});

test("readState reads the live config once and draws the settings and the keys from it", () => {
	const config = live({ provider: "openrouter", openrouter_api_key: "k" });
	const fake = createFakeApi({ config, pluginConfig: { api_key: "plug" } });
	const state = readState(fake.api, { TYPESAFE_API_KEY: "env" });
	assert.equal(state.config, config);
	assert.equal(state.settings.provider, "openrouter");
	assert.deepEqual(state.keys, { openrouter: "k" });
	assert.equal(fake.runtime.calls.config.length, 1);
});

test("readState falls back to the plugin config and the environment when the live config cannot be read", () => {
	const fake = createFakeApi({ pluginConfig: { provider: "auto" } });
	fake.runtime.throwOn.add("config");
	const state = readState(fake.api, { OPENROUTER_API_KEY: "env" });
	assert.equal(state.config, undefined);
	assert.equal(state.settings.provider, "auto");
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
