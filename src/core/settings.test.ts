/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";
import { order, PROVIDER_VALUES } from "./provider.ts";
import { SCOPE_VALUES } from "./scope.ts";
import {
	agentDiscoveryFailed,
	agentUnknown,
	alreadyValue,
	ask,
	badCall,
	COMMAND_DESCRIPTIONS,
	chooseValue,
	isKeySetting,
	isValue,
	isValueSetting,
	KEY_MAX_LENGTH,
	KEY_SETTINGS,
	KEY_UNSET,
	keyFrom,
	keyLine,
	keyNotSaved,
	keyProvider,
	keyQuestion,
	NO_ANSWER,
	NOT_OFFERED,
	outsideCoreScope,
	pick,
	projectOverrides,
	REFUSED,
	readOnlyToolDescription,
	SETTING_NAMES,
	setsOwnModel,
	settingsReport,
	TOOL_LABEL,
	toolDescription,
	UNREADABLE,
	unchanged,
	useOneOf,
	VALUE_SETTINGS,
	valueLine,
	valueSettingHelp,
} from "./settings.ts";

test("lists the four setting names, value settings first", () => {
	assert.deepEqual(SETTING_NAMES, [
		"provider",
		"scope",
		"typesafe_key",
		"openrouter_key",
	]);
	assert.deepEqual(VALUE_SETTINGS, ["provider", "scope"]);
	assert.deepEqual(KEY_SETTINGS, ["typesafe_key", "openrouter_key"]);
});

test("predicates tell value settings, key settings and other input apart", () => {
	for (const name of VALUE_SETTINGS) {
		assert.equal(isValueSetting(name), true, name);
		assert.equal(isKeySetting(name), false, name);
	}
	for (const name of KEY_SETTINGS) {
		assert.equal(isValueSetting(name), false, name);
		assert.equal(isKeySetting(name), true, name);
	}
	for (const other of ["", "key", "toString", 1, null, undefined]) {
		assert.equal(isValueSetting(other), false, String(other));
		assert.equal(isKeySetting(other), false, String(other));
	}
});

test("each key setting belongs to one provider", () => {
	assert.equal(keyProvider("typesafe_key"), "typesafe");
	assert.equal(keyProvider("openrouter_key"), "openrouter");
});

test("isValue accepts the listed values of its own setting only", () => {
	for (const value of PROVIDER_VALUES) {
		assert.equal(isValue("provider", value), true, value);
		assert.equal(isValue("scope", value), false, value);
	}
	for (const value of SCOPE_VALUES) {
		assert.equal(isValue("scope", value), true, value);
		assert.equal(isValue("provider", value), false, value);
	}
	for (const other of ["", "Auto", "toString", 1, null, undefined])
		assert.equal(isValue("provider", other), false, String(other));
});

test("the provider line equals the text the command prints today", () => {
	for (const value of PROVIDER_VALUES)
		assert.equal(
			valueLine("provider", value),
			`provider: ${value} (${order(value).join(", then ")})`,
		);
	assert.equal(
		valueLine("provider", "auto"),
		"provider: auto (typesafe, then openrouter)",
	);
	assert.equal(
		valueLine("provider", "typesafe"),
		"provider: typesafe (typesafe)",
	);
});

test("the scope line shows the resolved value", () => {
	assert.equal(valueLine("scope", "extended"), "scope: extended");
	assert.equal(valueLine("scope", "core"), "scope: core");
	assert.equal(valueLine("scope", undefined), "scope: core");
	assert.equal(valueLine("scope", "bogus"), "scope: core");
});

test("use-one-of and unchanged texts name the setting", () => {
	assert.equal(
		useOneOf("provider"),
		"provider: use one of auto, openrouter-first, typesafe, openrouter",
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
		assert.equal(
			keyLine(provider, "saved, checking"),
			`${provider} key: saved, checking`,
		);
		assert.equal(keyNotSaved(provider), `${provider} key not saved`);
	}
});

test("a dialog puts the current value first and keeps the declared order", () => {
	for (const [setting, values] of [
		["provider", PROVIDER_VALUES],
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
		"typesafe - TypeSafe only",
		"auto - TypeSafe, then OpenRouter if TypeSafe fails",
		"openrouter-first - OpenRouter, then TypeSafe if OpenRouter fails",
		"openrouter - OpenRouter only",
	]);
	assert.deepEqual(ask("scope", "core").options, [
		"core - today's routing: built-in general agents only",
		"extended - also routes other agents that pass no model",
	]);
});

test("pick maps an exact label to its value and refuses anything else", () => {
	for (const setting of VALUE_SETTINGS) {
		const values = setting === "provider" ? PROVIDER_VALUES : SCOPE_VALUES;
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
	const label = ask("provider", "auto").options[0] ?? "";
	assert.equal(
		await chooseValue(
			"provider",
			"auto",
			async () => label,
			async (value) => unchanged("provider", alreadyValue(value)),
		),
		"provider unchanged: already auto",
	);
	await assert.rejects(
		chooseValue(
			"provider",
			"auto",
			async () => label,
			async () => {
				throw new Error("apply failed");
			},
		),
		{ message: "apply failed" },
	);
	await assert.rejects(
		chooseValue(
			"provider",
			"auto",
			async () => {
				throw new Error("select failed");
			},
			async () => "",
		),
		{ message: "select failed" },
	);
});

test("settingsReport joins the value lines, the extra lines and the key lines in order", () => {
	assert.equal(
		settingsReport(
			"auto",
			"extended",
			["small_model: a/b"],
			[
				["typesafe", "set"],
				["openrouter", "unset"],
			],
		),
		"provider: auto (typesafe, then openrouter)\nscope: extended\nsmall_model: a/b\ntypesafe key: set\nopenrouter key: unset",
	);
	assert.equal(
		settingsReport("openrouter", "core", [], [["openrouter", "unset"]]),
		"provider: openrouter (openrouter)\nscope: core\nopenrouter key: unset",
	);
	assert.equal(
		settingsReport("typesafe", "core", [], []),
		"provider: typesafe (typesafe)\nscope: core",
	);
});

test("settingsReport prints the stored provider as it is and resolves the scope", () => {
	assert.equal(
		settingsReport(undefined, "bogus", [], [["typesafe", "set"]]),
		"provider: undefined (typesafe)\nscope: core\ntypesafe key: set",
	);
});

test("keyFrom returns the trimmed key and refuses anything else", () => {
	assert.equal(keyFrom("sk-abc"), "sk-abc");
	assert.equal(keyFrom("  sk-abc\t"), "sk-abc");
	assert.equal(keyFrom("x".repeat(KEY_MAX_LENGTH)), "x".repeat(KEY_MAX_LENGTH));
	const refused = [
		undefined,
		null,
		12,
		{},
		"",
		"   ",
		"\t",
		"a\nb",
		"a\r\nb",
		"a\rb",
		"sk-abc\n",
		"a\u2028b",
		"a\u2029b",
		"x".repeat(KEY_MAX_LENGTH + 1),
		"Yes",
		"No",
		" Yes ",
	];
	for (const answer of refused)
		assert.equal(keyFrom(answer), undefined, JSON.stringify(answer));
	assert.equal(keyFrom("yes"), "yes");
	assert.equal(keyFrom("Yes please"), "Yes please");
});

test("the key cap is 512", () => {
	assert.equal(KEY_MAX_LENGTH, 512);
});

test("the key question names the provider and the storage", () => {
	const fresh = keyQuestion("typesafe", false);
	assert.match(fresh, /TypeSafe/);
	assert.match(fresh, /credential store/);
	assert.doesNotMatch(fresh, /replace/);
	const replacing = keyQuestion("openrouter", true);
	assert.match(replacing, /OpenRouter/);
	assert.match(replacing, /credential store/);
	assert.match(replacing, /replaces/);
});

test("the tool description lists the names it is given", () => {
	for (const names of [SETTING_NAMES, VALUE_SETTINGS]) {
		const text = toolDescription(names);
		assert.ok(text.includes(`(${names.join(", ")})`));
		assert.match(text, /no input/);
		assert.match(text, /asks the person/);
		assert.match(text, /Never pass a value/);
	}
	assert.doesNotMatch(toolDescription(VALUE_SETTINGS), /_key/);
});

test("the read-only tool description joins what it returns and the names", () => {
	assert.equal(
		readOnlyToolDescription(["the provider", "both models"], ["a", "b"]),
		"Reads the router's settings. With no input it returns the provider, both models, and whether each key the provider allows is set. With a setting name (a, b) it returns how the person changes that setting. It changes nothing and never returns a key.",
	);
	assert.match(
		readOnlyToolDescription(["x"], SETTING_NAMES),
		/returns x, and whether/,
	);
});

test("the value setting help gives the command line, then the allowed values", () => {
	assert.equal(
		valueSettingHelp("provider"),
		"Type /model-router-provider <value> in the chat.\nprovider: use one of auto, openrouter-first, typesafe, openrouter",
	);
	assert.equal(
		valueSettingHelp("scope"),
		"Type /model-router-scope <value> in the chat.\nscope: use one of core, extended",
	);
});

test("the bad-call text lists the names it is given", () => {
	assert.ok(badCall(SETTING_NAMES).endsWith(SETTING_NAMES.join(", ")));
	assert.ok(badCall(VALUE_SETTINGS).endsWith("provider, scope"));
});

test("each value setting has a command description listing its values", () => {
	assert.deepEqual(Object.keys(COMMAND_DESCRIPTIONS), [...VALUE_SETTINGS]);
	assert.ok(COMMAND_DESCRIPTIONS.provider.includes(PROVIDER_VALUES.join(", ")));
	assert.ok(COMMAND_DESCRIPTIONS.scope.includes(SCOPE_VALUES.join(", ")));
	for (const text of Object.values(COMMAND_DESCRIPTIONS))
		assert.doesNotMatch(text, /claude|\bomp\b/i);
});

test("no text names a harness", () => {
	const texts = [
		toolDescription(SETTING_NAMES),
		badCall(SETTING_NAMES),
		keyQuestion("typesafe", true),
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

test("the refusal says nothing was read or changed", () => {
	assert.match(REFUSED, /Permission rules deny/);
	assert.match(REFUSED, /nothing was read or changed/);
});

test("the project-override note names the setting", () => {
	assert.equal(
		projectOverrides("scope"),
		"A project value for scope overrides it.",
	);
});

test("the tool label names the router", () => {
	assert.match(TOOL_LABEL, /Model Router/);
});

test("the fixed skip reasons read as they do in the log", () => {
	assert.equal(KEY_UNSET, "key unset");
	assert.equal(UNREADABLE, "settings unreadable");
	assert.equal(outsideCoreScope("scout"), "scout is outside the core scope");
	assert.equal(agentDiscoveryFailed("scout"), "scout agent discovery failed");
	assert.equal(agentUnknown("scout"), "scout agent unknown");
	assert.equal(setsOwnModel("scout"), "scout sets its own model");
});
