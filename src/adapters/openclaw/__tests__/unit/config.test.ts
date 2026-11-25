import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createFakeApi } from "#adapters/openclaw/__tests__/support/fakes.ts";
import {
	NOT_OWNER,
	registerConfigCommands,
	registerConfigTool,
} from "#adapters/openclaw/config.ts";
import { type Environment, PLUGIN_ID } from "#adapters/openclaw/settings.ts";
import type {
	CommandContext,
	CommandDefinition,
	OpenClawApi,
	OpenClawConfig,
	ToolDefinition,
} from "#adapters/openclaw/types.ts";
import {
	alreadyValue,
	COMMAND_DESCRIPTIONS,
	keyLine,
	TOOL_LABEL,
	unchanged,
	useOneOf,
} from "#core/options/settings.ts";

/** Registers the config tool and the commands on `api`, as the full pass does. */
function registerConfig(api: OpenClawApi, env: Environment) {
	registerConfigTool(api, env);
	registerConfigCommands(api, env);
}

const TYPESAFE_KEY = "ts-live-key-8f3a91c2d7e4b605";
const OPENROUTER_KEY = "or-live-key-1d6e77a0c9b3f248";
const ADMIN = "operator.admin";
// The models lines of the report when the models setting is unset.
const UNSET_MODELS = [
	"models: unset",
	"typesafe model: jev-latest (OpenRouter: jev-latest)",
	"openai model: gpt-6-luna (OpenRouter: openai/gpt-6-luna-decisions)",
	"google model: gemini-decision-1 (OpenRouter: google/gemini-decision-1)",
];
const NO_ENV = { TYPESAFE_API_KEY: "", OPENROUTER_API_KEY: "" };

const live = (config: Record<string, unknown>): OpenClawConfig => ({
	plugins: { entries: { [PLUGIN_ID]: { config } } },
});

type Stored = {
	provider?: unknown;
	gateway?: unknown;
	scope?: unknown;
	small_model?: unknown;
};

/**
 * Registers the config tool and commands on a fake api whose live config holds
 * `config`. Returns the fake with `command`, `tool` and `stored`. `command` and
 * `tool` fail the test when the registration is missing.
 */
function setup(
	config: Record<string, unknown> = {},
	env: Environment = process.env,
) {
	const fake = createFakeApi({ config: live(config) });
	registerConfig(fake.api, env);
	const command = (name: string): CommandDefinition => {
		const found = fake.commands.find((c) => c.name === name);
		assert.ok(found, `command ${name} registered`);
		return found;
	};
	const tool = (): ToolDefinition => {
		const found = fake.tools[0];
		assert.ok(found, "tool registered");
		return found;
	};
	/** Returns the plugin settings stored in the live config, or an empty object when none is. */
	const stored = () =>
		(fake.runtime.answers.config.plugins?.entries?.[PLUGIN_ID]?.config ??
			{}) as Stored;
	return { ...fake, command, tool, stored };
}

/** Returns the context of a command from the owner, with `args` only when given. */
const ownerContext = (args?: string): CommandContext => ({
	channel: "webchat",
	isAuthorizedSender: true,
	senderIsOwner: true,
	commandBody: "",
	config: {},
	...(args === undefined ? {} : { args }),
});

const runCommand = async (
	name: string,
	context: CommandContext,
	fake: ReturnType<typeof setup>,
) => (await fake.command(name).handler(context)).text;

const runTool = async (fake: ReturnType<typeof setup>) =>
	(await fake.tool().execute("call-1", {})).content
		.map((part) => part.text)
		.join("\n");

const lines = (...parts: string[]) => parts.join("\n");

/**
 * Runs `run` with the process environment cleared of the Jev key variables and
 * holding only `values` that are set. Restores the environment afterwards, even
 * when `run` rejects.
 */
async function withEnv(
	values: Record<string, string | undefined>,
	run: () => Promise<void>,
) {
	const saved = { ...process.env };
	for (const name of Object.keys(NO_ENV)) delete process.env[name];
	for (const [name, value] of Object.entries(values))
		if (value !== undefined) process.env[name] = value;
	try {
		await run();
	} finally {
		for (const name of Object.keys(NO_ENV)) delete process.env[name];
		Object.assign(process.env, saved);
	}
}

describe("registration", () => {
	it("registers the tool and both owner-only commands", () => {
		const fake = setup();
		assert.deepEqual(
			fake.tools.map((t) => t.name),
			["model_router_config"],
		);
		assert.equal(fake.tool().label, TOOL_LABEL);
		assert.deepEqual(fake.commands.map((c) => c.name).sort(), [
			"model-router-gateway",
			"model-router-provider",
			"model-router-scope",
		]);
		for (const command of fake.commands) {
			assert.deepEqual(command.requiredScopes, [ADMIN]);
			assert.equal(command.acceptsArgs, true);
		}
		assert.equal(
			fake.command("model-router-provider").description,
			COMMAND_DESCRIPTIONS.provider,
		);
		assert.equal(
			fake.command("model-router-scope").description,
			COMMAND_DESCRIPTIONS.scope,
		);
	});

	it("registers the tool with its description text", () => {
		assert.equal(
			setup().tool().description,
			"Reads the router's settings. It returns the provider, the gateway, the scope, the scoring models, the three models, and whether each key the settings allow is set. It changes nothing and never returns a key.",
		);
	});

	it("takes no input: the schema is an empty strict object", () => {
		assert.deepEqual(setup().tool().parameters, {
			type: "object",
			properties: {},
			additionalProperties: false,
		});
	});

	it("registers no command for the models", () => {
		assert.equal(
			setup().commands.some(
				(c) => /model$/.test(c.name) || c.name.includes("models"),
			),
			false,
		);
	});
});

describe("the tool reads", () => {
	it("shows the defaults and the typesafe key line", async () => {
		await withEnv({}, async () => {
			const fake = setup();
			assert.equal(
				await runTool(fake),
				lines(
					"provider: typesafe",
					"gateway: direct (typesafe)",
					"scope: core",
					...UNSET_MODELS,
					"small_model: unset",
					"middle_model: unset",
					"large_model: unset",
					keyLine("typesafe", "unset"),
				),
			);
		});
	});

	it("shows both key lines for auto and openrouter-first", async () => {
		await withEnv({}, async () => {
			for (const gateway of ["auto", "openrouter-first"]) {
				const text = await runTool(setup({ gateway }));
				assert.match(text, new RegExp(keyLine("typesafe", "unset")));
				assert.match(text, new RegExp(keyLine("openrouter", "unset")));
			}
		});
	});

	it("shows only the openrouter key line for openrouter", async () => {
		await withEnv({}, async () => {
			const text = await runTool(setup({ gateway: "openrouter" }));
			assert.match(text, new RegExp(keyLine("openrouter", "unset")));
			assert.doesNotMatch(text, /typesafe key/);
		});
	});

	it("shows the models and the set key state without any key text", async () => {
		const fake = setup({
			gateway: "auto",
			scope: "extended",
			small_model: "openai/gpt-5-mini",
			middle_model: "openai/gpt-5",
			large_model: "anthropic/claude-opus-5-5",
			api_key: TYPESAFE_KEY,
			openrouter_api_key: OPENROUTER_KEY,
		});
		const text = await runTool(fake);
		assert.equal(
			text,
			lines(
				"provider: typesafe",
				"gateway: auto (typesafe, then openrouter)",
				"scope: extended",
				...UNSET_MODELS,
				"small_model: openai/gpt-5-mini",
				"middle_model: openai/gpt-5",
				"large_model: anthropic/claude-opus-5-5",
				keyLine("typesafe", "set"),
				keyLine("openrouter", "set"),
			),
		);
		for (const key of [TYPESAFE_KEY, OPENROUTER_KEY]) {
			assert.equal(text.includes(key), false);
			assert.equal(text.includes(String(key.length)), false);
		}
	});

	it("shows a model on its own line, unset when only another is set", async () => {
		const env = { ...NO_ENV, TYPESAFE_API_KEY: TYPESAFE_KEY };
		const report = (config: Record<string, unknown>) =>
			runTool(setup({ gateway: "openrouter-first", ...config }, env));
		const head = [
			"provider: typesafe",
			"gateway: openrouter-first (openrouter, then typesafe)",
			"scope: core",
			...UNSET_MODELS,
		];
		const keys = [keyLine("openrouter", "unset"), keyLine("typesafe", "set")];
		assert.equal(
			await report({ small_model: "openai/gpt-5-mini" }),
			lines(
				...head,
				"small_model: openai/gpt-5-mini",
				"middle_model: unset",
				"large_model: unset",
				...keys,
			),
		);
		assert.equal(
			await report({ middle_model: "openai/gpt-5" }),
			lines(
				...head,
				"small_model: unset",
				"middle_model: openai/gpt-5",
				"large_model: unset",
				...keys,
			),
		);
		assert.equal(
			await report({ large_model: "anthropic/claude-opus-5-5" }),
			lines(
				...head,
				"small_model: unset",
				"middle_model: unset",
				"large_model: anthropic/claude-opus-5-5",
				...keys,
			),
		);
	});

	it("shows a configured model as it is", async () => {
		const fake = setup({
			small_model: "openai/gpt-5-mini",
			middle_model: "openai/gpt-5",
			api_key: TYPESAFE_KEY,
		});
		assert.equal(
			await runTool(fake),
			lines(
				"provider: typesafe",
				"gateway: direct (typesafe)",
				"scope: core",
				...UNSET_MODELS,
				"small_model: openai/gpt-5-mini",
				"middle_model: openai/gpt-5",
				"large_model: unset",
				keyLine("typesafe", "set"),
			),
		);
	});

	it("shows the models lines for a text and for a native object", async () => {
		const lines3 = [
			"typesafe model: jev-preview (OpenRouter: jev-preview)",
			"openai model: gpt-6-luna (OpenRouter: openai/gpt-6-luna-decisions)",
			"google model: gemini-decision-1 (OpenRouter: google/gemini-decision-1)",
		];
		const report = (models: unknown) =>
			runTool(setup({ models, api_key: TYPESAFE_KEY }));
		assert.equal(
			await report("{typesafe:jev-preview}"),
			lines(
				"provider: typesafe",
				"gateway: direct (typesafe)",
				"scope: core",
				"models: {typesafe:jev-preview}",
				...lines3,
				"small_model: unset",
				"middle_model: unset",
				"large_model: unset",
				keyLine("typesafe", "set"),
			),
		);
		assert.match(
			await report({ typesafe: "jev-preview" }),
			/\nmodels: \{"typesafe":"jev-preview"\}\ntypesafe model: jev-preview /,
		);
	});

	it("names the entry of a models value that is not valid", async () => {
		assert.equal(
			await runTool(setup({ models: "typesafe:jev, acme:x" })),
			lines(
				"provider: typesafe",
				"gateway: direct",
				"scope: core",
				"models: typesafe:jev, acme:x (not valid: acme:x)",
				"small_model: unset",
				"middle_model: unset",
				"large_model: unset",
			),
		);
	});

	it("counts a key from the environment as set", async () => {
		await withEnv({ TYPESAFE_API_KEY: TYPESAFE_KEY }, async () => {
			const text = await runTool(setup());
			assert.match(text, new RegExp(keyLine("typesafe", "set")));
			assert.equal(text.includes(TYPESAFE_KEY), false);
		});
	});

	it("reads the keys from the environment it was given, not from the process", async () => {
		await withEnv({ OPENROUTER_API_KEY: OPENROUTER_KEY }, async () => {
			const given = await runTool(
				setup({ gateway: "auto" }, { TYPESAFE_API_KEY: TYPESAFE_KEY }),
			);
			assert.match(given, new RegExp(keyLine("typesafe", "set")));
			assert.match(given, new RegExp(keyLine("openrouter", "unset")));
		});
	});

	it("falls back to the plugin config when the live config is unreadable", async () => {
		const fake = setup();
		fake.runtime.throwOn.add("config");
		fake.api.pluginConfig = { scope: "extended" };
		assert.match(await runTool(fake), /scope: extended/);
	});

	it("answers with text when the config cannot be read", async () => {
		const fake = setup();
		fake.runtime.throwOn.add("config");
		assert.equal(typeof (await runTool(fake)), "string");
	});

	it("never changes a setting", async () => {
		const fake = setup();
		await runTool(fake);
		assert.deepEqual(fake.runtime.calls.mutate, []);
	});
});

describe("the commands", () => {
	it("show the current value when called without an argument", async () => {
		const fake = setup({ gateway: "auto", scope: "extended" });
		assert.equal(
			await runCommand("model-router-gateway", ownerContext(), fake),
			"gateway: auto (typesafe, then openrouter)",
		);
		assert.equal(
			await runCommand("model-router-scope", ownerContext("  "), fake),
			"scope: extended",
		);
		assert.deepEqual(fake.runtime.calls.mutate, []);
	});

	it("write the value with the owner check and show it", async () => {
		const fake = setup({ gateway: "direct" });
		assert.equal(
			await runCommand(
				"model-router-gateway",
				ownerContext(" openrouter "),
				fake,
			),
			"gateway: openrouter (openrouter)",
		);
		assert.equal(fake.stored().gateway, "openrouter");
		assert.equal(
			await runCommand("model-router-scope", ownerContext("extended"), fake),
			"scope: extended",
		);
		assert.equal(fake.stored().scope, "extended");
	});

	it("write when the plugin has no config entry yet", async () => {
		const fake = createFakeApi({ config: {} });
		registerConfig(fake.api, {});
		const command = fake.commands.find((c) => c.name === "model-router-scope");
		await command?.handler(ownerContext("extended"));
		assert.deepEqual(
			fake.runtime.answers.config.plugins?.entries?.[PLUGIN_ID]?.config,
			{ scope: "extended" },
		);
	});

	it("keep the other settings and let the next read see the write", async () => {
		const fake = setup({ small_model: "openai/gpt-5-mini" });
		await runCommand("model-router-gateway", ownerContext("auto"), fake);
		assert.equal(fake.stored().small_model, "openai/gpt-5-mini");
		assert.match(await runTool(fake), /gateway: auto/);
	});

	it("ask OpenClaw to replace the plugin so the new instance reads the value", async () => {
		const fake = setup();
		await runCommand("model-router-scope", ownerContext("extended"), fake);
		const [call] = fake.runtime.calls.mutate;
		assert.deepEqual(call?.afterWrite, { mode: "auto" });
	});

	it("hand the owner recheck to the config writer", async () => {
		const fake = setup();
		let rechecked = 0;
		const context = ownerContext("extended");
		context.assertOwnerCurrent = () => {
			rechecked += 1;
		};
		await runCommand("model-router-scope", context, fake);
		assert.equal(rechecked, 1);
	});

	it("report an owner recheck that fails and leave the value", async () => {
		const fake = setup({ scope: "core" });
		const context = ownerContext("extended");
		context.assertOwnerCurrent = () => {
			throw new Error("owner changed");
		};
		assert.equal(
			await runCommand("model-router-scope", context, fake),
			unchanged("scope", "owner changed"),
		);
		assert.equal(fake.stored().scope, "core");
	});

	it("word the refusal as the owner-only rule", async () => {
		const fake = setup({ gateway: "auto" });
		const context = { ...ownerContext("openrouter"), senderIsOwner: false };
		assert.equal(NOT_OWNER, "only the owner can change it");
		assert.equal(
			await runCommand("model-router-gateway", context, fake),
			lines(
				"gateway unchanged: only the owner can change it",
				"gateway: auto (typesafe, then openrouter)",
			),
		);
	});

	it("refuse without the owner flag and show the current value", async () => {
		const fake = setup({ gateway: "auto" });
		const context = { ...ownerContext("openrouter"), senderIsOwner: false };
		assert.equal(
			await runCommand("model-router-gateway", context, fake),
			lines(
				unchanged("gateway", NOT_OWNER),
				"gateway: auto (typesafe, then openrouter)",
			),
		);
		assert.deepEqual(fake.runtime.calls.mutate, []);
	});

	it("refuse a sender whose owner flag is absent", async () => {
		const fake = setup();
		const context = ownerContext("extended");
		delete context.senderIsOwner;
		assert.match(
			(await runCommand("model-router-scope", context, fake)) ?? "",
			/scope unchanged/,
		);
		assert.deepEqual(fake.runtime.calls.mutate, []);
	});

	it("answer an invalid value with the allowed values", async () => {
		const fake = setup();
		assert.equal(
			await runCommand("model-router-provider", ownerContext("bogus"), fake),
			useOneOf("provider"),
		);
		assert.equal(
			await runCommand("model-router-scope", ownerContext("auto"), fake),
			useOneOf("scope"),
		);
		assert.deepEqual(fake.runtime.calls.mutate, []);
	});

	it("say the value is already set and write nothing", async () => {
		const fake = setup({ provider: "typesafe", scope: "extended" });
		assert.equal(
			await runCommand("model-router-scope", ownerContext("extended"), fake),
			unchanged("scope", alreadyValue("extended")),
		);
		assert.equal(
			await runCommand("model-router-provider", ownerContext("typesafe"), fake),
			unchanged("provider", alreadyValue("typesafe")),
		);
		assert.deepEqual(fake.runtime.calls.mutate, []);
	});

	it("write a valid value over a stored text that is not valid", async () => {
		const fake = setup({ gateway: "fast" });
		assert.equal(
			await runCommand("model-router-gateway", ownerContext("direct"), fake),
			"gateway: direct (typesafe)",
		);
		assert.equal(fake.stored().gateway, "direct");
	});

	it("answer with text when the write throws", async () => {
		const fake = setup({ scope: "core" });
		fake.runtime.throwOn.add("mutate");
		assert.equal(
			await runCommand("model-router-scope", ownerContext("extended"), fake),
			unchanged("scope", "fake mutate failure"),
		);
		assert.equal(fake.stored().scope, "core");
	});

	it("answer with text when the config cannot be read", async () => {
		const fake = setup();
		fake.runtime.throwOn.add("config");
		assert.equal(
			typeof (await runCommand("model-router-scope", ownerContext(), fake)),
			"string",
		);
		assert.equal(
			typeof (await runCommand(
				"model-router-scope",
				ownerContext("extended"),
				fake,
			)),
			"string",
		);
	});
});
