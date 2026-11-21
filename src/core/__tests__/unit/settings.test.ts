/// <reference types="node" />

import assert from "node:assert/strict";
import { test } from "node:test";
import { SCOPE_VALUES } from "#core/options/scope.ts";
import {
	alreadyValue,
	ask,
	badCall,
	COMMAND_DESCRIPTIONS,
	chooseValue,
	isValue,
	isValueSetting,
	keyLine,
	NO_ANSWER,
	NOT_OFFERED,
	pick,
	readOnlyToolDescription,
	scopeOf,
	settingsOf,
	settingsReport,
	TOOL_LABEL,
	toolDescription,
	unchanged,
	useOneOf,
	VALUE_SETTINGS,
	type ValueSetting,
	valueFor,
	valueLine,
} from "#core/options/settings.ts";
import { collectKeys, GATEWAYS, MAKERS } from "#core/providers/provider.ts";

test("lists the value settings", () => {
	assert.deepEqual(VALUE_SETTINGS, ["provider", "gateway", "scope"]);
});

test("isValueSetting accepts the value settings and refuses other input", () => {
	for (const name of VALUE_SETTINGS)
		assert.equal(isValueSetting(name), true, name);
	for (const other of [
		"",
		"key",
		"typesafe_key",
		"openrouter_key",
		"toString",
		1,
		null,
		undefined,
	])
		assert.equal(isValueSetting(other), false, String(other));
});

test("isValue accepts the listed values of its own setting only", () => {
	for (const value of MAKERS) {
		assert.equal(isValue("provider", value), true, value);
		assert.equal(isValue("scope", value), false, value);
	}
	for (const value of GATEWAYS) {
		assert.equal(isValue("gateway", value), true, value);
		assert.equal(isValue("provider", value), false, value);
	}
	for (const value of SCOPE_VALUES) {
		assert.equal(isValue("scope", value), true, value);
		assert.equal(isValue("provider", value), false, value);
	}
	for (const other of ["", "Auto", "toString", 1, null, undefined])
		assert.equal(isValue("provider", other), false, String(other));
});

test("a stored text outside the values is not valid, and an absent, blank or non-text value reads as the default", () => {
	const DEFAULT: Record<ValueSetting, string> = {
		provider: "typesafe",
		gateway: "direct",
		scope: "core",
	};
	const notValid: [ValueSetting, string][] = [
		["provider", "auto"],
		["provider", "openrouter-first"],
		["provider", "openrouter"],
		["provider", "toString"],
		["gateway", "fast"],
		["scope", "wide"],
	];
	for (const [setting, text] of notValid)
		assert.equal(valueFor(setting, text), undefined, text);
	for (const setting of VALUE_SETTINGS)
		for (const stored of [
			undefined,
			"",
			"  ",
			1,
			null,
			["auto"],
			{ toString: () => "auto" },
		])
			assert.equal(valueFor(setting, stored), DEFAULT[setting], setting);
});

test("the scope reads on its own: a valid stored scope holds when another setting is not valid, and the default stands in for a scope that is not", () => {
	assert.equal(scopeOf({ provider: "auto", scope: "extended" }), "extended");
	assert.equal(scopeOf({ scope: "wide" }), "core");
});

test("a setting that is not valid gives its setup reason, and no key is looked up", async () => {
	for (const [stored, reason] of [
		[{ provider: "auto" }, "provider not valid: run setup"],
		[{ gateway: "fast", scope: "wide" }, "gateway not valid: run setup"],
	] as const) {
		const settings = settingsOf(stored);
		assert.deepEqual(settings, { skipped: reason });
		const looked: string[] = [];
		assert.deepEqual(
			await collectKeys(settings, async (holder) => {
				looked.push(holder);
				return "test-key";
			}),
			{},
		);
		assert.deepEqual(looked, []);
	}
});

test("the gateway line names the holders its value allows, in order", () => {
	assert.equal(
		valueLine("gateway", { gateway: "direct" }),
		"gateway: direct (typesafe)",
	);
	assert.equal(
		valueLine("gateway", { gateway: "auto" }),
		"gateway: auto (typesafe, then openrouter)",
	);
	assert.equal(
		valueLine("gateway", { gateway: "openrouter-first" }),
		"gateway: openrouter-first (openrouter, then typesafe)",
	);
	assert.equal(
		valueLine("gateway", { gateway: "openrouter" }),
		"gateway: openrouter (openrouter)",
	);
});

test("the scope line shows the value, the default when none is stored, or that it is not valid", () => {
	assert.equal(valueLine("scope", { scope: "extended" }), "scope: extended");
	assert.equal(valueLine("scope", { scope: "core" }), "scope: core");
	assert.equal(valueLine("scope", {}), "scope: core");
	assert.equal(
		valueLine("scope", { scope: "bogus" }),
		"scope: bogus (not valid: use one of core, extended)",
	);
});

test("use-one-of and unchanged texts name the setting", () => {
	assert.equal(
		useOneOf("provider"),
		"provider: use one of typesafe, openai, google",
	);
	assert.equal(useOneOf("scope"), "scope: use one of core, extended");
	assert.equal(
		unchanged("scope", "already core"),
		"scope unchanged: already core",
	);
	assert.equal(unchanged("provider", "denied"), "provider unchanged: denied");
});

test("key status lines name the provider", () => {
	for (const provider of ["typesafe", "openrouter"] as const) {
		assert.equal(keyLine(provider, "set"), `${provider} key: set`);
		assert.equal(keyLine(provider, "unset"), `${provider} key: unset`);
	}
});

test("a dialog puts the current value first and keeps the declared order", () => {
	for (const [setting, values] of [
		["provider", MAKERS],
		["gateway", GATEWAYS],
		["scope", SCOPE_VALUES],
	] as const)
		for (const current of values) {
			const { question, options } = ask(setting, current);
			assert.ok(question.endsWith("?"), question);
			assert.deepEqual(
				options.map((label) => label.split(" - ")[0]),
				[current, ...values.filter((value) => value !== current)],
			);
		}
});

test("a dialog treats an unknown current value as the default", () => {
	const first = (setting: "provider" | "scope", current: unknown) =>
		ask(setting, current).options[0]?.split(" - ")[0];
	assert.equal(first("provider", "bogus"), "typesafe");
	assert.equal(first("provider", undefined), "typesafe");
	assert.equal(first("scope", "bogus"), "core");
	assert.equal(first("scope", undefined), "core");
});

test("every label is a value, a dash and a one-line consequence, never recommended", () => {
	for (const setting of VALUE_SETTINGS)
		for (const label of ask(setting, undefined).options) {
			assert.match(label, /^[a-z-]+ - [^\n]+$/, label);
			assert.doesNotMatch(label, /recommend/i, label);
		}
});

test("labels carry the consequences of each value", () => {
	assert.deepEqual(ask("provider", "typesafe").options, [
		"typesafe - Jev from TypeSafe, the model the plugin's questions are fitted to",
		"openai - OpenAI's decision model; costs more than Jev and its answers are not fitted",
		"google - Google's decision model; costs more than Jev and its answers are not fitted; on a free-tier key Google may use the text",
	]);
	assert.deepEqual(ask("gateway", "direct").options, [
		"direct - the provider's own API only",
		"auto - the provider's own API, then OpenRouter if it fails",
		"openrouter-first - OpenRouter, then the provider's own API if it fails",
		"openrouter - OpenRouter only",
	]);
	assert.deepEqual(ask("scope", "core").options, [
		"core - built-in general agents only",
		"extended - also routes other agents that pass no model",
	]);
});

test("pick maps an exact label to its value and refuses anything else", () => {
	for (const setting of VALUE_SETTINGS) {
		const values = { provider: MAKERS, gateway: GATEWAYS, scope: SCOPE_VALUES }[
			setting
		];
		for (const current of values) {
			const { options } = ask(setting, current);
			for (const label of options) {
				assert.equal(pick(setting, label), label.split(" - ")[0], label);
				assert.equal(pick(setting, `${label} `), undefined);
				assert.equal(pick(setting, label.toUpperCase()), undefined);
			}
		}
	}
	for (const other of ["auto", "extended", "", "Yes", "No", 1, null, undefined])
		assert.equal(pick("provider", other), undefined, String(other));
	assert.equal(pick("scope", "typesafe - TypeSafe only"), undefined);
});

test("chooseValue asks the dialog's question and applies the picked value", async () => {
	const asked: unknown[] = [];
	const applied: string[] = [];
	const text = await chooseValue(
		"scope",
		"extended",
		async (question, options) => {
			asked.push({ question, options });
			return ask("scope", undefined).options[1];
		},
		async (value) => {
			applied.push(value);
			return `applied ${value}`;
		},
	);
	assert.equal(text, "applied extended");
	assert.deepEqual(applied, ["extended"]);
	assert.deepEqual(asked, [ask("scope", "extended")]);
});

test("chooseValue maps no answer to the no-answer line and applies nothing", async () => {
	let applied = 0;
	const text = await chooseValue(
		"provider",
		undefined,
		async () => undefined,
		async () => {
			applied += 1;
			return "";
		},
	);
	assert.equal(text, unchanged("provider", NO_ANSWER));
	assert.equal(applied, 0);
});

test("chooseValue maps a select that rejects or throws to the no-answer line and applies nothing", async () => {
	let applied = 0;
	const apply = async () => {
		applied += 1;
		return "";
	};
	assert.equal(
		await chooseValue(
			"provider",
			undefined,
			async () => {
				throw new Error("dialog gone");
			},
			apply,
		),
		unchanged("provider", NO_ANSWER),
	);
	assert.equal(
		await chooseValue(
			"provider",
			undefined,
			() => Promise.reject(new Error("dialog gone")),
			apply,
		),
		unchanged("provider", NO_ANSWER),
	);
	assert.equal(applied, 0);
});

test("chooseValue maps an unknown answer to the not-offered line and never echoes it", async () => {
	let applied = 0;
	for (const answer of ["auto", "", "secret-text", "auto - TypeSafe only"]) {
		const text = await chooseValue(
			"provider",
			"auto",
			async () => answer,
			async () => {
				applied += 1;
				return "";
			},
		);
		assert.equal(text, unchanged("provider", NOT_OFFERED));
		assert.equal(text.includes("secret-text"), false);
	}
	assert.equal(applied, 0);
});

test("chooseValue returns what apply returns, and a throw passes through", async () => {
	const label = ask("provider", "typesafe").options[0] ?? "";
	assert.equal(
		await chooseValue(
			"provider",
			"typesafe",
			async () => label,
			async (value) => unchanged("provider", alreadyValue(value)),
		),
		"provider unchanged: already typesafe",
	);
	await assert.rejects(
		chooseValue(
			"provider",
			"typesafe",
			async () => label,
			async () => {
				throw new Error("apply failed");
			},
		),
		{ message: "apply failed" },
	);
});

test("settingsReport joins the value lines, the extra lines and the key lines in order", () => {
	assert.equal(
		settingsReport(
			{ gateway: "auto", scope: "extended" },
			["small_model: a/b"],
			{
				typesafe: "key-1",
			},
		),
		"provider: typesafe\ngateway: auto (typesafe, then openrouter)\nscope: extended\nsmall_model: a/b\ntypesafe key: set\nopenrouter key: unset",
	);
});

test("settingsReport lists the holders the gateway allows, in their order", () => {
	assert.equal(
		settingsReport({ gateway: "openrouter-first" }, [], { typesafe: "key-1" }),
		"provider: typesafe\ngateway: openrouter-first (openrouter, then typesafe)\nscope: core\nopenrouter key: unset\ntypesafe key: set",
	);
	assert.equal(
		settingsReport({ gateway: "openrouter" }, [], { typesafe: "key-1" }),
		"provider: typesafe\ngateway: openrouter (openrouter)\nscope: core\nopenrouter key: unset",
	);
});

test("settingsReport names the openai holder first under provider openai and gateway auto", () => {
	assert.equal(
		settingsReport({ provider: "openai", gateway: "auto" }, [], {
			openai: "key-1",
		}),
		"provider: openai\ngateway: auto (openai, then openrouter)\nscope: core\nopenai key: set\nopenrouter key: unset",
	);
});

test("settingsReport never prints a key", () => {
	const report = settingsReport({ gateway: "auto" }, [], {
		typesafe: "key-1",
		openrouter: "key-2",
	});
	assert.doesNotMatch(report, /key-[12]/);
});

test("settingsReport gives key lines only when every setting is valid", () => {
	const KEY = { typesafe: "key-1" };
	assert.equal(
		settingsReport({}, [], KEY),
		"provider: typesafe\ngateway: direct (typesafe)\nscope: core\ntypesafe key: set",
	);
	assert.equal(
		settingsReport({ provider: "auto" }, [], KEY),
		"provider: auto (not valid: use one of typesafe, openai, google)\ngateway: direct\nscope: core",
	);
	assert.equal(
		settingsReport({ gateway: "fast" }, [], KEY),
		"provider: typesafe\ngateway: fast (not valid: use one of direct, auto, openrouter-first, openrouter)\nscope: core",
	);
	assert.equal(
		settingsReport({ scope: "wide" }, [], KEY),
		"provider: typesafe\ngateway: direct\nscope: wide (not valid: use one of core, extended)",
	);
});

test("the tool description names the value settings and the dialog", () => {
	assert.equal(
		toolDescription(),
		"Reads the router's settings. With no input it returns the provider, gateway and scope, and whether each key the settings allow is set. With a setting name (provider, gateway, scope) the plugin asks the person in its own dialog and writes their choice. Never pass a value or a key. The person picks the value in the dialog.",
	);
});

test("the read-only tool description joins what it returns", () => {
	assert.equal(
		readOnlyToolDescription(["the provider", "both models"]),
		"Reads the router's settings. It returns the provider, both models, and whether each key the settings allow is set. It changes nothing and never returns a key.",
	);
});

test("the bad-call text lists the value settings", () => {
	assert.equal(
		badCall(),
		"Unknown setting. Pass no setting, or one of: provider, gateway, scope",
	);
});

test("each value setting has a command description listing its values", () => {
	assert.deepEqual(Object.keys(COMMAND_DESCRIPTIONS), [...VALUE_SETTINGS]);
	assert.ok(COMMAND_DESCRIPTIONS.provider.includes(MAKERS.join(", ")));
	assert.ok(COMMAND_DESCRIPTIONS.gateway.includes(GATEWAYS.join(", ")));
	assert.ok(COMMAND_DESCRIPTIONS.scope.includes(SCOPE_VALUES.join(", ")));
	for (const text of Object.values(COMMAND_DESCRIPTIONS))
		assert.doesNotMatch(text, /claude|\bomp\b/i);
});

test("no text names a harness", () => {
	const texts = [
		toolDescription(),
		badCall(),
		...VALUE_SETTINGS.flatMap((s) => ask(s, undefined).options),
	];
	for (const text of texts) assert.doesNotMatch(text, /claude|\bomp\b/i, text);
});

test("the reasons of an unchanged value read after the setting name", () => {
	assert.equal(alreadyValue("core"), "already core");
	assert.equal(
		unchanged("scope", NO_ANSWER),
		"scope unchanged: no answer from the dialog",
	);
	assert.equal(
		unchanged("scope", NOT_OFFERED),
		"scope unchanged: the answer was not one of the offered values",
	);
});

test("the tool label names the router", () => {
	assert.match(TOOL_LABEL, /Model Router/);
});
