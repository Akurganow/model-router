/// <reference types="node" />

import assert from "node:assert/strict";
import { test } from "node:test";
import { SCOPE_VALUES } from "#core/options/scope.ts";
import {
	alreadyValue,
	ask,
	askPaged,
	badCall,
	COMMAND_DESCRIPTIONS,
	chooseValue,
	currentFirst,
	isValue,
	isValueSetting,
	keyLine,
	MORE,
	modelCarry,
	modelsAlready,
	modelsCallOf,
	modelsLines,
	modelsWrite,
	NO_ANSWER,
	NOT_OFFERED,
	pagesOf,
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
		"typesafe - Jev from TypeSafe",
		"openai - OpenAI's decision model",
		"google - Google's decision model",
	]);
	assert.deepEqual(ask("gateway", "direct").options, [
		"direct - the provider's own API only",
		"auto - the provider's own API, then OpenRouter if it fails",
		"openrouter-first - OpenRouter, then the provider's own API if it fails",
		"openrouter - OpenRouter only",
	]);
	assert.deepEqual(ask("scope", "core").options, [
		"core - the default agents only",
		"extended - also other agents, as the README lists",
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

const UNSET_MODELS = [
	"models: unset",
	"typesafe model: jev-latest (OpenRouter: jev-latest)",
	"openai model: gpt-6-luna (OpenRouter: openai/gpt-6-luna-decisions)",
	"google model: gemini-decision-1 (OpenRouter: google/gemini-decision-1)",
].join("\n");

test("settingsReport joins the value lines, the extra lines and the key lines in order", () => {
	assert.equal(
		settingsReport(
			{ gateway: "auto", scope: "extended" },
			["small_model: a/b"],
			{
				typesafe: "key-1",
			},
		),
		"provider: typesafe\ngateway: auto (typesafe, then openrouter)\nscope: extended\n" +
			UNSET_MODELS +
			"\nsmall_model: a/b\ntypesafe key: set\nopenrouter key: unset",
	);
});

test("settingsReport lists the holders the gateway allows, in their order", () => {
	assert.equal(
		settingsReport({ gateway: "openrouter-first" }, [], { typesafe: "key-1" }),
		"provider: typesafe\ngateway: openrouter-first (openrouter, then typesafe)\nscope: core\n" +
			UNSET_MODELS +
			"\nopenrouter key: unset\ntypesafe key: set",
	);
	assert.equal(
		settingsReport({ gateway: "openrouter" }, [], { typesafe: "key-1" }),
		"provider: typesafe\ngateway: openrouter (openrouter)\nscope: core\n" +
			UNSET_MODELS +
			"\nopenrouter key: unset",
	);
});

test("settingsReport names the openai holder first under provider openai and gateway auto", () => {
	assert.equal(
		settingsReport({ provider: "openai", gateway: "auto" }, [], {
			openai: "key-1",
		}),
		"provider: openai\ngateway: auto (openai, then openrouter)\nscope: core\n" +
			UNSET_MODELS +
			"\nopenai key: set\nopenrouter key: unset",
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
		"provider: typesafe\ngateway: direct (typesafe)\nscope: core\n" +
			UNSET_MODELS +
			"\ntypesafe key: set",
	);
	assert.equal(
		settingsReport({ provider: "auto" }, [], KEY),
		"provider: auto (not valid: use one of typesafe, openai, google)\ngateway: direct\nscope: core\n" +
			UNSET_MODELS,
	);
	assert.equal(
		settingsReport({ gateway: "fast" }, [], KEY),
		"provider: typesafe\ngateway: fast (not valid: use one of direct, auto, openrouter-first, openrouter)\nscope: core\n" +
			UNSET_MODELS,
	);
	assert.equal(
		settingsReport({ scope: "wide" }, [], KEY),
		"provider: typesafe\ngateway: direct\nscope: wide (not valid: use one of core, extended)\n" +
			UNSET_MODELS,
	);
});

test("the tool description names the value settings and the dialog", () => {
	assert.equal(
		toolDescription(),
		"Reads the router's settings. With no input it returns the provider, gateway, scope and models, and whether each key the settings allow is set. With a setting name (provider, gateway, scope) the plugin asks the person in its own dialog and writes their choice; never pass a value for these. With models and a string, the tool writes that string as the models setting at the person's request, for example {typesafe:jev-latest, openai:gpt-6-luna}. Never pass a key.",
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

test("a silent models reads as no names, each in its own row", () => {
	for (const models of ["", "   ", null, undefined])
		assert.deepEqual(settingsOf({ models }), {
			provider: "typesafe",
			gateway: "direct",
			scope: "core",
			models: {},
		});
});

test("a valid models text, JSON text or object gives the names", () => {
	for (const models of [
		"{typesafe:jev-preview, openai:gpt-6-luna}",
		'{"typesafe": "jev-preview", "openai": "gpt-6-luna"}',
		{ typesafe: "jev-preview", openai: "gpt-6-luna" },
	])
		assert.deepEqual(settingsOf({ models }), {
			provider: "typesafe",
			gateway: "direct",
			scope: "core",
			models: { typesafe: "jev-preview", openai: "gpt-6-luna" },
		});
});

test("a models text that is not valid gives its setup reason", () => {
	assert.deepEqual(settingsOf({ models: "{acme:x}" }), {
		skipped: "models not valid: run setup",
	});
});

test("a setting checked earlier decides the reason before models does", () => {
	assert.deepEqual(settingsOf({ scope: "wide", models: "{acme:x}" }), {
		skipped: "scope not valid: run setup",
	});
});

test("an old model option with no models gives the typesafe name", () => {
	const settings = settingsOf({ model: "jev-preview" });
	assert.ok(!("skipped" in settings));
	assert.equal(settings.models.typesafe, "jev-preview");
});

test("the report shows the models as stored and the model each path takes", () => {
	assert.equal(
		settingsReport(
			{ models: "{typesafe:jev-1.14.0, openai:gpt-7-sol}" },
			[],
			{},
		),
		"provider: typesafe\ngateway: direct (typesafe)\nscope: core\n" +
			"models: {typesafe:jev-1.14.0, openai:gpt-7-sol}\n" +
			"typesafe model: jev-1.14.0 (OpenRouter: typesafe/jev-1.14)\n" +
			"openai model: gpt-7-sol (OpenRouter: openai/gpt-7-sol)\n" +
			"google model: gemini-decision-1 (OpenRouter: google/gemini-decision-1)\n" +
			"typesafe key: unset",
	);
});

test("the report shows a models object as JSON", () => {
	assert.match(
		settingsReport({ models: { google: "gemini-decision-1" } }, [], {}),
		/\nmodels: \{"google":"gemini-decision-1"\}\n/,
	);
});

test("the report says when the ladder made the models and they are not stored yet", () => {
	assert.equal(
		settingsReport({ model: "jev-preview" }, [], {}),
		"provider: typesafe\ngateway: direct (typesafe)\nscope: core\n" +
			"models: {typesafe:jev-preview} (not stored yet: run setup)\n" +
			"typesafe model: jev-preview (OpenRouter: jev-preview)\n" +
			"openai model: gpt-6-luna (OpenRouter: openai/gpt-6-luna-decisions)\n" +
			"google model: gemini-decision-1 (OpenRouter: google/gemini-decision-1)\n" +
			"typesafe key: unset",
	);
});

test("the report names the entry that is not valid and gives no maker lines and no key lines", () => {
	assert.equal(
		settingsReport({ models: "{openai:a/b}" }, [], { typesafe: "key-1" }),
		"provider: typesafe\ngateway: direct\nscope: core\nmodels: {openai:a/b} (not valid: openai:a/b)",
	);
});

test("modelsWrite refuses a text that is not valid and names the entry", () => {
	assert.deepEqual(modelsWrite({}, "{acme:x}"), {
		refused: "models unchanged: not valid: acme:x",
	});
});

test("modelsWrite gives the text as it is when the ladder changes nothing", () => {
	assert.deepEqual(modelsWrite({}, "{openai:gpt-6-luna}"), {
		models: "{openai:gpt-6-luna}",
	});
	assert.deepEqual(
		modelsWrite({ model: "jev-preview" }, "{typesafe:jev-latest}"),
		{ models: "{typesafe:jev-latest}" },
	);
});

test("modelsWrite folds a stored old model into the text and says nothing of erasing it", () => {
	assert.deepEqual(modelsWrite({ model: "jev-preview" }, "openai:gpt-6-luna"), {
		models: "{typesafe:jev-preview, openai:gpt-6-luna}",
	});
});

test("modelCarry gives the ladder's text only when an old model changes it", () => {
	assert.deepEqual(modelCarry({ model: "jev-preview" }), {
		models: "{typesafe:jev-preview}",
		eraseModel: true,
	});
	assert.deepEqual(
		modelCarry({ model: "jev-preview", models: { openai: "a" } }),
		{ models: '{"openai":"a","typesafe":"jev-preview"}', eraseModel: true },
	);
	assert.deepEqual(modelCarry({}), { eraseModel: false });
});

test("modelCarry erases a stored old model even when the ladder copies nothing", () => {
	for (const stored of [
		{ model: "jev-preview", models: "{typesafe:jev-latest}" },
		{ model: "jev-preview", models: "{acme:x}" },
		{ model: "a/b" },
	])
		assert.deepEqual(modelCarry(stored), { eraseModel: true }, stored.model);
});

test("modelCarry erases nothing for a blank old model", () => {
	for (const model of ["", "   ", null, undefined, 5])
		assert.deepEqual(
			modelCarry({ model }),
			{ eraseModel: false },
			String(model),
		);
});

test("the report says a removed model is not stored yet, though the ladder copies nothing", () => {
	assert.match(
		settingsReport(
			{ model: "jev-preview", models: "{typesafe:jev-latest}" },
			[],
			{},
		),
		/\nmodels: \{typesafe:jev-latest\} \(not stored yet: run setup\)\n/,
	);
});

test("the report says a models value is unset for each silent form, and shows any other form as it is", () => {
	for (const models of ["", "   ", null, undefined])
		assert.equal(modelsLines({ models })[0], "models: unset", String(models));
	assert.equal(modelsLines({ models: 0 })[0], "models: 0 (not valid: 0)");
	assert.equal(
		modelsLines({ models: false })[0],
		"models: false (not valid: false)",
	);
});

test("modelsCallOf takes the text of a models call and refuses any other shape", () => {
	assert.deepEqual(modelsCallOf(undefined, "{openai:a}"), {
		text: "{openai:a}",
	});
	assert.deepEqual(modelsCallOf(undefined, ""), { text: "" });
	for (const [setting, models] of [
		["scope", "{openai:a}"],
		[undefined, 3],
		[undefined, null],
		[undefined, { openai: "a" }],
	] as const)
		assert.deepEqual(
			modelsCallOf(setting, models),
			{ refused: "Pass setting alone, or models as a text alone." },
			String(models),
		);
});

test("modelsAlready names the text only when it equals what is stored", () => {
	assert.equal(
		modelsAlready("{openai:a}", "{openai:a}"),
		"models unchanged: already {openai:a}",
	);
	assert.equal(modelsAlready("{openai:a}", "{openai:b}"), undefined);
	assert.equal(modelsAlready(undefined, ""), undefined);
	assert.equal(modelsAlready({ openai: "a" }, '{"openai":"a"}'), undefined);
});

test("six or five values give two pages with more last, the current value first, and more wraps", async () => {
	const labels = ["a", "b", "c", "d", "e", "f"];
	assert.deepEqual(currentFirst(labels, "e"), ["e", "a", "b", "c", "d", "f"]);
	assert.deepEqual(currentFirst(labels, undefined), labels);
	assert.equal(MORE, "more");
	assert.deepEqual(pagesOf(currentFirst(labels, "e")), [
		["e", "a", "b", "more"],
		["c", "d", "f", "more"],
	]);
	assert.deepEqual(pagesOf(["a", "b", "c", "d", "e"]), [
		["a", "b", "c", "more"],
		["d", "e", "more"],
	]);
	const shown: string[][] = [];
	const answers = ["more", "more", "b"];
	const answer = await askPaged(
		"q",
		currentFirst(labels, "e"),
		async (_question, page) => {
			shown.push(page);
			return answers.shift();
		},
	);
	assert.deepEqual(shown, [
		["e", "a", "b", "more"],
		["c", "d", "f", "more"],
		["e", "a", "b", "more"],
	]);
	assert.equal(answer, "b");
});

test("four values give one page with no more", () => {
	assert.deepEqual(pagesOf(["a", "b", "c", "d"]), [["a", "b", "c", "d"]]);
});

test("chooseValue refuses more from a choice of one page as not offered", async () => {
	let applied = false;
	const text = await chooseValue(
		"scope",
		"core",
		async () => MORE,
		async () => {
			applied = true;
			return "applied";
		},
	);
	assert.equal(text, `scope unchanged: ${NOT_OFFERED}`);
	assert.equal(applied, false);
});
