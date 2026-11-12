import assert from "node:assert/strict";
import { test } from "node:test";
import { registerConfigTool } from "./config.ts";
import { createFakeApi } from "./fakes.ts";
import { PLUGIN_ID } from "./settings.ts";

const NO_KEYS = { TYPESAFE_API_KEY: "", OPENROUTER_API_KEY: "" };

// Runs the tool with no setting against a live config and an environment, and returns its text.
async function report(
	config: Record<string, unknown>,
	env: Record<string, string> = NO_KEYS,
): Promise<string> {
	const fake = createFakeApi({
		config: { plugins: { entries: { [PLUGIN_ID]: { config } } } },
	});
	registerConfigTool(fake.api, env);
	const tool = fake.tools[0];
	assert.ok(tool, "tool registered");
	const reply = await tool.execute("call-1", {});
	return reply.content.map((part) => part.text).join("\n");
}

test("the report lists provider, scope, both models and the key state of each allowed provider", async () => {
	const full = {
		small_model: "openai/gpt-5-mini",
		large_model: "anthropic/claude-opus-5-5",
	};
	const cases: [string, Record<string, unknown>, Record<string, string>][] = [
		[
			"provider: auto (typesafe, then openrouter)\nscope: core\nsmall_model: openai/gpt-5-mini\nlarge_model: anthropic/claude-opus-5-5\ntypesafe key: set\nopenrouter key: set",
			{ provider: "auto", ...full },
			{ TYPESAFE_API_KEY: "a-key", OPENROUTER_API_KEY: "b-key" },
		],
		[
			"provider: auto (typesafe, then openrouter)\nscope: extended\nsmall_model: unset\nlarge_model: unset\ntypesafe key: unset\nopenrouter key: set",
			{ provider: "auto", scope: "extended" },
			{ ...NO_KEYS, OPENROUTER_API_KEY: "b-key" },
		],
		[
			"provider: openrouter-first (openrouter, then typesafe)\nscope: core\nsmall_model: openai/gpt-5-mini\nlarge_model: unset\nopenrouter key: unset\ntypesafe key: set",
			{ provider: "openrouter-first", small_model: "openai/gpt-5-mini" },
			{ ...NO_KEYS, TYPESAFE_API_KEY: "a-key" },
		],
		[
			"provider: openrouter (openrouter)\nscope: core\nsmall_model: unset\nlarge_model: anthropic/claude-opus-5-5\nopenrouter key: set",
			{ provider: "openrouter", large_model: "anthropic/claude-opus-5-5" },
			{ TYPESAFE_API_KEY: "a-key", OPENROUTER_API_KEY: "b-key" },
		],
		[
			"provider: typesafe (typesafe)\nscope: core\nsmall_model: unset\nlarge_model: unset\ntypesafe key: unset",
			{ provider: "typesafe" },
			NO_KEYS,
		],
	];
	for (const [text, config, env] of cases)
		assert.equal(await report(config, env), text, JSON.stringify(config));
});

test("a key in the plugin config counts as set, and the report never shows it", async () => {
	const text = await report({
		provider: "auto",
		api_key: "ts-secret-key",
		openrouter_api_key: "or-secret-key",
	});
	assert.equal(
		text,
		"provider: auto (typesafe, then openrouter)\nscope: core\nsmall_model: unset\nlarge_model: unset\ntypesafe key: set\nopenrouter key: set",
	);
});
