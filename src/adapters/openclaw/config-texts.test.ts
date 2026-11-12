import assert from "node:assert/strict";
import { test } from "node:test";
import { registerConfigTool, TOOL_DESCRIPTION } from "./config.ts";
import { createFakeApi } from "./fakes.ts";

test("the tool description is this exact text", () => {
	assert.equal(
		TOOL_DESCRIPTION,
		"Reads the router's settings. With no input it returns the provider, the scope, both models, and whether each key the provider allows is set. With a setting name (provider, scope, typesafe_key, openrouter_key, small_model, large_model) it returns how the person changes that setting. It changes nothing and never returns a key.",
	);
});

test("the registered tool carries the exact description", () => {
	const fake = createFakeApi({ config: {} });
	registerConfigTool(fake.api, {});
	assert.equal(fake.tools[0]?.description, TOOL_DESCRIPTION);
});

test("the tool answers a value setting with these exact two lines", async () => {
	const fake = createFakeApi({ config: {} });
	registerConfigTool(fake.api, {});
	const tool = fake.tools[0];
	assert.ok(tool, "tool registered");
	const answer = async (setting: string) =>
		(await tool.execute("call-1", { setting })).content
			.map((part) => part.text)
			.join("\n");
	assert.equal(
		await answer("provider"),
		"Type /model-router-provider <value> in the chat.\nprovider: use one of auto, openrouter-first, typesafe, openrouter",
	);
	assert.equal(
		await answer("scope"),
		"Type /model-router-scope <value> in the chat.\nscope: use one of core, extended",
	);
});
