import assert from "node:assert/strict";
import { test } from "node:test";
import {
	answeringEngine,
	dialogs,
	flush,
	recordingEngine,
	type Step,
} from "#adapters/claude/__tests__/support/fakes.ts";
import {
	configCall,
	configCommand,
	REFUSED,
	resetConfig,
} from "#adapters/claude/config.ts";
import type { CommandRun, ConfigCall, Engine } from "#adapters/claude/host.ts";
import { NO_ANSWER, unchanged, valueLine } from "#core/options/settings.ts";

test("the refusal says nothing was read or changed", () => {
	assert.match(REFUSED, /Permission rules deny/);
	assert.match(REFUSED, /nothing was read or changed/);
});

const typed = (args: string): CommandRun => ({
	command: "model-router:scope",
	args,
	origin: { kind: "composer" },
});

const CALL = { tool: "mcp__model-router__config" };
const CORE = "core - built-in general agents only";
const EXTENDED = "extended - also routes other agents that pass no model";
const DIRECT = "direct - the provider's own API only";
const AUTO = "auto - the provider's own API, then OpenRouter if it fails";
const OPENROUTER_FIRST =
	"openrouter-first - OpenRouter, then the provider's own API if it fails";
const OPENROUTER = "openrouter - OpenRouter only";
const TYPESAFE =
	"typesafe - Jev from TypeSafe, the model the plugin's questions are fitted to";

const call = (setting: string): ConfigCall => ({ ...CALL, setting });

test("a write that throws a non-error prints the thrown text", async () => {
	resetConfig();
	const $ = {
		config: {
			set: async () => {
				throw "no row";
			},
		},
	} as unknown as Engine;
	const out = await configCommand($, typed("extended"), "scope", {});
	assert.deepEqual(out, { text: "scope unchanged: no row" });
});

test("a reset forgets what the instance wrote", async () => {
	const $ = { config: { set: async () => ({}) } } as unknown as Engine;
	await configCommand($, typed("extended"), "scope", {});
	assert.deepEqual(await configCommand($, typed(""), "scope", {}), {
		text: "scope: extended",
	});
	resetConfig();
	assert.deepEqual(await configCommand($, typed(""), "scope", {}), {
		text: "scope: core",
	});
});

test("a call whose dialog fails answers no answer, and the call behind it starts only after", async () => {
	resetConfig();
	const { $, log, open } = dialogs();
	const first = configCall($, call("scope"), {});
	const second = configCall($, call("scope"), {});
	await flush();
	assert.deepEqual(log, ["check", "ask"]);
	open[0]?.reject(new Error("dialog gone"));
	assert.deepEqual(await first, { result: unchanged("scope", NO_ANSWER) });
	await flush();
	assert.deepEqual(log, ["check", "ask", "check", "ask"]);
	open[1]?.resolve(EXTENDED);
	assert.deepEqual(await second, {
		result: valueLine("scope", { scope: "extended" }),
	});
});

test("a call that throws rejects its caller, and the call behind it still runs after", async () => {
	resetConfig();
	const { $, log, open } = dialogs();
	let release: () => void = () => undefined;
	let checks = 0;
	$.tool.check = async () => {
		checks += 1;
		log.push("check");
		if (checks === 1) {
			await new Promise<void>((resolve) => {
				release = resolve;
			});
			throw new Error("no rules");
		}
		return { decision: "allow" };
	};
	const first = configCall($, call("scope"), {});
	const second = configCall($, call("scope"), {});
	await flush();
	assert.deepEqual(log, ["check"]);
	release();
	await assert.rejects(first, { message: "no rules" });
	await flush();
	assert.deepEqual(log, ["check", "check", "ask"]);
	open[0]?.resolve(EXTENDED);
	assert.deepEqual(await second, {
		result: valueLine("scope", { scope: "extended" }),
	});
});

test("a reset drops a pending queue, so a call after it does not wait for an unsettled one", async () => {
	resetConfig();
	const { $, log, open } = dialogs();
	const stuck = configCall($, call("scope"), {});
	await flush();
	assert.deepEqual(log, ["check", "ask"]);
	resetConfig();
	const fresh = configCall($, call("scope"), {});
	await flush();
	assert.deepEqual(log, ["check", "ask", "check", "ask"]);
	open[1]?.resolve(EXTENDED);
	assert.deepEqual(await fresh, {
		result: valueLine("scope", { scope: "extended" }),
	});
	open[0]?.reject(new Error("dialog gone"));
	assert.deepEqual(await stuck, { result: unchanged("scope", NO_ANSWER) });
});

test("the scope dialog offers the current value first and writes a new pick", async () => {
	resetConfig();
	const { $, log } = answeringEngine(async () => EXTENDED);
	assert.deepEqual(await configCall($, call("scope"), {}), {
		result: "scope: extended",
	});
	assert.deepEqual(log, [
		"check",
		{
			ask: [
				"Which agent calls should the router route?",
				{ options: [CORE, EXTENDED], header: "scope" },
			],
		},
		{ set: { key: "model-router.scope", value: "extended" } },
	]);
});

test("the gateway dialog puts the stored value first and keeps the rest in order", async () => {
	resetConfig();
	const { $, log } = answeringEngine(async () => OPENROUTER_FIRST);
	assert.deepEqual(
		await configCall($, call("gateway"), { gateway: "openrouter" }),
		{ result: "gateway: openrouter-first (openrouter, then typesafe)" },
	);
	assert.deepEqual(log, [
		"check",
		{
			ask: [
				"How should OpenRouter be used for the provider?",
				{
					options: [OPENROUTER, DIRECT, AUTO, OPENROUTER_FIRST],
					header: "gateway",
				},
			],
		},
		{ set: { key: "model-router.gateway", value: "openrouter-first" } },
	]);
});

test("a valid value chosen over a stored text that is not valid is written", async () => {
	resetConfig();
	const { $, log } = answeringEngine(async () => DIRECT);
	assert.deepEqual(await configCall($, call("gateway"), { gateway: "fast" }), {
		result: "gateway: direct (typesafe)",
	});
	assert.deepEqual(log.at(-1), {
		set: { key: "model-router.gateway", value: "direct" },
	});
});

// The steps a call took that are not the dialog itself: the permission check and any write.
const checksAndWrites = (log: Step[]) =>
	log.filter((step) => typeof step === "string" || "set" in step);

const FAILURES = [
	{
		name: "rejects",
		answer: async () => {
			throw new Error("dialog gone");
		},
	},
	{
		name: "resolves nothing",
		answer: async () => undefined as unknown as string,
	},
];

for (const { name, answer } of FAILURES)
	test(`a dialog that ${name} answers no answer and writes nothing`, async () => {
		resetConfig();
		const { $, log } = answeringEngine(answer);
		assert.deepEqual(await configCall($, call("scope"), {}), {
			result: "scope unchanged: no answer from the dialog",
		});
		assert.deepEqual(checksAndWrites(log), ["check"]);
	});

test("an answer that is not a label is not offered and is never echoed", async () => {
	resetConfig();
	const { $, log } = answeringEngine(async () => "extended");
	assert.deepEqual(await configCall($, call("scope"), {}), {
		result: "scope unchanged: the answer was not one of the offered values",
	});
	assert.equal(log.length, 2);
	assert.equal(log[0], "check");
});

test("the default picked while nothing is stored is written, because no stored value equals it", async () => {
	resetConfig();
	const { $, log } = answeringEngine(async () => TYPESAFE);
	assert.deepEqual(await configCall($, call("provider"), {}), {
		result: "provider: typesafe",
	});
	assert.deepEqual(log.at(-1), {
		set: { key: "model-router.provider", value: "typesafe" },
	});
});

test("a pick of the stored value counts as already set, and a written one counts for the next call", async () => {
	resetConfig();
	const typesafe = answeringEngine(async () => TYPESAFE);
	assert.deepEqual(
		await configCall(typesafe.$, call("provider"), { provider: "typesafe" }),
		{ result: "provider unchanged: already typesafe" },
	);
	assert.equal(typesafe.log.length, 2);
	const { $, log } = answeringEngine(async () => EXTENDED);
	assert.deepEqual(await configCall($, call("scope"), { scope: "extended" }), {
		result: "scope unchanged: already extended",
	});
	assert.equal(log.length, 2);
	assert.deepEqual(await configCall($, call("scope"), {}), {
		result: "scope: extended",
	});
	assert.deepEqual(await configCall($, call("scope"), {}), {
		result: "scope unchanged: already extended",
	});
});

test("a write that is denied or throws leaves the setting unchanged", async () => {
	resetConfig();
	const denied = answeringEngine(
		async () => EXTENDED,
		async () => ({ deny: "read only" }),
	);
	assert.deepEqual(await configCall(denied.$, call("scope"), {}), {
		result: "scope unchanged: read only",
	});
	const thrown = answeringEngine(
		async () => EXTENDED,
		async () => {
			throw new Error("row gone");
		},
	);
	assert.deepEqual(await configCall(thrown.$, call("scope"), {}), {
		result: "scope unchanged: row gone",
	});
});

test("a tool call denied by the permission rules never opens the dialog", async () => {
	resetConfig();
	const { $, log } = answeringEngine(async () => EXTENDED);
	$.tool.check = async () => {
		log.push("check");
		return { decision: "deny" };
	};
	assert.deepEqual(await configCall($, call("scope"), {}), {
		deny: "Permission rules deny this tool, so nothing was read or changed.",
	});
	assert.deepEqual(log, ["check"]);
});

// The report lists the three settings and one line for each key the gateway allows.
const report = async (options: Record<string, unknown>, env: Set<string>) => {
	const { engine, reads } = recordingEngine((name) =>
		env.has(name) ? "a-key" : undefined,
	);
	const answer = await configCall(engine, CALL, options);
	return { answer, reads };
};

test("the settings report lists the values and each key the gateway allows", async () => {
	resetConfig();
	const cases: [Record<string, unknown>, string[], string][] = [
		[
			{},
			[],
			"provider: typesafe\ngateway: direct (typesafe)\nscope: core\nmodels: unset\ntypesafe model: jev-latest (OpenRouter: jev-latest)\nopenai model: gpt-6-luna (OpenRouter: openai/gpt-6-luna-decisions)\ngoogle model: gemini-decision-1 (OpenRouter: google/gemini-decision-1)\ntypesafe key: unset",
		],
		[
			{ gateway: "auto", scope: "extended", api_key: "k-1" },
			["OPENROUTER_API_KEY"],
			"provider: typesafe\ngateway: auto (typesafe, then openrouter)\nscope: extended\nmodels: unset\ntypesafe model: jev-latest (OpenRouter: jev-latest)\nopenai model: gpt-6-luna (OpenRouter: openai/gpt-6-luna-decisions)\ngoogle model: gemini-decision-1 (OpenRouter: google/gemini-decision-1)\ntypesafe key: set\nopenrouter key: set",
		],
		[
			{ gateway: "openrouter-first" },
			["TYPESAFE_API_KEY"],
			"provider: typesafe\ngateway: openrouter-first (openrouter, then typesafe)\nscope: core\nmodels: unset\ntypesafe model: jev-latest (OpenRouter: jev-latest)\nopenai model: gpt-6-luna (OpenRouter: openai/gpt-6-luna-decisions)\ngoogle model: gemini-decision-1 (OpenRouter: google/gemini-decision-1)\nopenrouter key: unset\ntypesafe key: set",
		],
		[
			{ gateway: "openrouter", openrouter_api_key: "k-2", api_key: "k-1" },
			[],
			"provider: typesafe\ngateway: openrouter (openrouter)\nscope: core\nmodels: unset\ntypesafe model: jev-latest (OpenRouter: jev-latest)\nopenai model: gpt-6-luna (OpenRouter: openai/gpt-6-luna-decisions)\ngoogle model: gemini-decision-1 (OpenRouter: google/gemini-decision-1)\nopenrouter key: set",
		],
		[
			{ gateway: "auto", api_key: "  ", openrouter_api_key: "" },
			[],
			"provider: typesafe\ngateway: auto (typesafe, then openrouter)\nscope: core\nmodels: unset\ntypesafe model: jev-latest (OpenRouter: jev-latest)\nopenai model: gpt-6-luna (OpenRouter: openai/gpt-6-luna-decisions)\ngoogle model: gemini-decision-1 (OpenRouter: google/gemini-decision-1)\ntypesafe key: unset\nopenrouter key: unset",
		],
		[
			{ models: "{typesafe:jev-latest, openai:gpt-6-luna}" },
			[],
			"provider: typesafe\ngateway: direct (typesafe)\nscope: core\nmodels: {typesafe:jev-latest, openai:gpt-6-luna}\ntypesafe model: jev-latest (OpenRouter: jev-latest)\nopenai model: gpt-6-luna (OpenRouter: openai/gpt-6-luna-decisions)\ngoogle model: gemini-decision-1 (OpenRouter: google/gemini-decision-1)\ntypesafe key: unset",
		],
		[
			{ model: "jev-preview" },
			[],
			"provider: typesafe\ngateway: direct (typesafe)\nscope: core\nmodels: {typesafe:jev-preview} (not stored yet: run setup)\ntypesafe model: jev-preview (OpenRouter: jev-preview)\nopenai model: gpt-6-luna (OpenRouter: openai/gpt-6-luna-decisions)\ngoogle model: gemini-decision-1 (OpenRouter: google/gemini-decision-1)\ntypesafe key: unset",
		],
		[
			{ models: "{typesafe:jev-latest, foo:bar}" },
			[],
			"provider: typesafe\ngateway: direct\nscope: core\nmodels: {typesafe:jev-latest, foo:bar} (not valid: foo:bar)",
		],
	];
	for (const [options, env, text] of cases) {
		resetConfig();
		const { answer } = await report(options, new Set(env));
		assert.deepEqual(answer, { result: text }, JSON.stringify(options));
	}
});

test("the settings report reads only the variables of the key holders the gateway allows", async () => {
	resetConfig();
	const { reads } = await report({ gateway: "openrouter" }, new Set());
	assert.deepEqual(reads, ["OPENROUTER_API_KEY"]);
});

const MODELS = "{typesafe:jev-latest, openai:gpt-6-luna}";
const MODELS_LINES = [
	`models: ${MODELS}`,
	"typesafe model: jev-latest (OpenRouter: jev-latest)",
	"openai model: gpt-6-luna (OpenRouter: openai/gpt-6-luna-decisions)",
	"google model: gemini-decision-1 (OpenRouter: google/gemini-decision-1)",
].join("\n");
const MODELS_KEY = "model-router.models";
const MODEL_KEY = "model-router.model";
const OPENAI =
	"openai - OpenAI's decision model; costs more than Jev and its answers are not fitted";

const modelsCall = (models: unknown, setting?: unknown): ConfigCall => ({
	...CALL,
	models,
	...(setting === undefined ? {} : { setting }),
});

test("a models write returns the models lines and writes models, then erases the removed model option", async () => {
	resetConfig();
	const { $, log } = answeringEngine(async () => "unused");
	assert.deepEqual(
		await configCall($, modelsCall(MODELS), { model: "jev-preview" }),
		{ result: MODELS_LINES },
	);
	assert.deepEqual(log, [
		"check",
		{ set: { key: MODELS_KEY, value: MODELS } },
		{ set: { key: MODEL_KEY, value: "" } },
	]);
});

test("a models write that names no typesafe entry stores the removed model option as one", async () => {
	resetConfig();
	const { $, log } = answeringEngine(async () => "unused");
	await configCall($, modelsCall("{openai:gpt-6-luna}"), {
		model: "jev-preview",
	});
	assert.deepEqual(log, [
		"check",
		{
			set: {
				key: MODELS_KEY,
				value: "{typesafe:jev-preview, openai:gpt-6-luna}",
			},
		},
		{ set: { key: MODEL_KEY, value: "" } },
	]);
});

test("a models write with no removed model option writes models alone", async () => {
	resetConfig();
	const { $, log } = answeringEngine(async () => "unused");
	assert.deepEqual(await configCall($, modelsCall(MODELS), {}), {
		result: MODELS_LINES,
	});
	assert.deepEqual(log, ["check", { set: { key: MODELS_KEY, value: MODELS } }]);
});

test("the text already stored is unchanged, unless a removed model option is left to erase", async () => {
	resetConfig();
	const same = answeringEngine(async () => "unused");
	assert.deepEqual(
		await configCall(same.$, modelsCall(MODELS), { models: MODELS }),
		{ result: `models unchanged: already ${MODELS}` },
	);
	assert.deepEqual(same.log, ["check"]);
	const left = answeringEngine(async () => "unused");
	assert.deepEqual(
		await configCall(left.$, modelsCall(MODELS), {
			models: MODELS,
			model: "jev-preview",
		}),
		{ result: MODELS_LINES },
	);
	assert.deepEqual(left.log, ["check", { set: { key: MODEL_KEY, value: "" } }]);
});

test("the text the report shows, with a removed model option stored, erases it and writes no models", async () => {
	resetConfig();
	const { $, log } = answeringEngine(async () => "unused");
	assert.deepEqual(
		await configCall($, modelsCall("{typesafe:jev-latest}"), {
			model: "jev-preview",
			models: "{typesafe:jev-latest}",
		}),
		{
			result: [
				"models: {typesafe:jev-latest}",
				"typesafe model: jev-latest (OpenRouter: jev-latest)",
				"openai model: gpt-6-luna (OpenRouter: openai/gpt-6-luna-decisions)",
				"google model: gemini-decision-1 (OpenRouter: google/gemini-decision-1)",
			].join("\n"),
		},
	);
	assert.deepEqual(log, ["check", { set: { key: MODEL_KEY, value: "" } }]);
});

test("a models write is remembered, so the same text again is unchanged", async () => {
	resetConfig();
	const { $ } = answeringEngine(async () => "unused");
	await configCall($, modelsCall(MODELS), {});
	assert.deepEqual(await configCall($, modelsCall(MODELS), {}), {
		result: `models unchanged: already ${MODELS}`,
	});
});

for (const [text, entry] of [
	["{foo:bar}", "foo:bar"],
	["{typesafe:}", "typesafe:"],
	["{typesafe}", "typesafe"],
	["{typesafe:a, typesafe:b}", "typesafe:b"],
	["{typesafe:a/b}", "typesafe:a/b"],
	['{"typesafe":5}', "typesafe"],
	["jev", "jev"],
] as const)
	test(`models text ${text} is refused with its failing entry and writes nothing`, async () => {
		resetConfig();
		const { $, log } = answeringEngine(async () => "unused");
		assert.deepEqual(
			await configCall($, modelsCall(text), { model: "jev-preview" }),
			{ result: `models unchanged: not valid: ${entry}` },
		);
		assert.deepEqual(log, ["check"]);
	});

test("a denied or thrown models write stops before the erase and is not remembered", async () => {
	resetConfig();
	const denied = answeringEngine(
		async () => "unused",
		async () => ({ deny: "read only" }),
	);
	assert.deepEqual(
		await configCall(denied.$, modelsCall(MODELS), { model: "jev-preview" }),
		{ result: "models unchanged: read only" },
	);
	assert.deepEqual(denied.log, [
		"check",
		{ set: { key: MODELS_KEY, value: MODELS } },
	]);
	resetConfig();
	const thrown = answeringEngine(
		async () => "unused",
		async () => {
			throw new Error("row gone");
		},
	);
	assert.deepEqual(
		await configCall(thrown.$, modelsCall(MODELS), { model: "jev-preview" }),
		{ result: "models unchanged: row gone" },
	);
	assert.equal(thrown.log.length, 2);
	assert.deepEqual(await configCall(thrown.$, modelsCall(MODELS), {}), {
		result: "models unchanged: row gone",
	});
});

test("an erase that fails leaves the models written and names the model option", async () => {
	resetConfig();
	let writes = 0;
	const { $ } = answeringEngine(
		async () => "unused",
		async () => (++writes === 2 ? { deny: "read only" } : {}),
	);
	assert.deepEqual(
		await configCall($, modelsCall(MODELS), { model: "jev-preview" }),
		{
			result: `${MODELS_LINES.replace(MODELS, `${MODELS} (not stored yet: run setup)`)}\nmodel unchanged: read only`,
		},
	);
});

for (const [name, input] of [
	["a setting with models", modelsCall(MODELS, "scope")],
	["models that are not text", modelsCall(3)],
	["models that are null", modelsCall(null)],
] as const)
	test(`${name} is a bad call and writes nothing`, async () => {
		resetConfig();
		const { $, log } = answeringEngine(async () => EXTENDED);
		assert.deepEqual(await configCall($, input, {}), {
			result: "Pass setting alone, or models as a text alone.",
		});
		assert.deepEqual(log, ["check"]);
	});

test("a provider pick writes the models text the removed model option makes, then erases it", async () => {
	resetConfig();
	const { $, log } = answeringEngine(async () => OPENAI);
	assert.deepEqual(
		await configCall($, call("provider"), { model: "jev-preview" }),
		{ result: "provider: openai" },
	);
	assert.deepEqual(log.slice(2), [
		{ set: { key: "model-router.provider", value: "openai" } },
		{ set: { key: MODELS_KEY, value: "{typesafe:jev-preview}" } },
		{ set: { key: MODEL_KEY, value: "" } },
	]);
});

test("a provider pick erases the removed model option though the ladder changes nothing, and writes no models text", async () => {
	resetConfig();
	const { $, log } = answeringEngine(async () => OPENAI);
	assert.deepEqual(
		await configCall($, call("provider"), {
			model: "jev-preview",
			models: "{typesafe:jev-latest}",
		}),
		{ result: "provider: openai" },
	);
	assert.deepEqual(log.slice(2), [
		{ set: { key: "model-router.provider", value: "openai" } },
		{ set: { key: MODEL_KEY, value: "" } },
	]);
});

test("a provider pick with no removed model option writes the provider alone, and a refused one writes nothing more", async () => {
	resetConfig();
	const plain = answeringEngine(async () => OPENAI);
	await configCall(plain.$, call("provider"), {});
	assert.equal(plain.log.length, 3);
	resetConfig();
	const refused = answeringEngine(
		async () => OPENAI,
		async () => ({ deny: "read only" }),
	);
	assert.deepEqual(
		await configCall(refused.$, call("provider"), { model: "jev-preview" }),
		{ result: "provider unchanged: read only" },
	);
	assert.equal(refused.log.length, 3);
});

test("the provider command makes the same follow-up writes as the dialog", async () => {
	resetConfig();
	const { $, log } = answeringEngine(async () => "unused");
	const out = await configCommand(
		$,
		{ ...typed("openai"), command: "model-router:provider" },
		"provider",
		{ model: "jev-preview" },
	);
	assert.deepEqual(out, { text: "provider: openai" });
	assert.deepEqual(log, [
		{ set: { key: "model-router.provider", value: "openai" } },
		{ set: { key: MODELS_KEY, value: "{typesafe:jev-preview}" } },
		{ set: { key: MODEL_KEY, value: "" } },
	]);
});
