import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { setupTexts } from "../src/adapters/hermes/setup.ts";
import { loadSource } from "./build/source.ts";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const source = loadSource(ROOT);
const texts = setupTexts(source.hermes.pluginName);

test("the Hermes tool description and provider help are these exact texts", () => {
	assert.equal(
		texts.toolDescription,
		"Reads the router's settings. With no input it returns the provider, both models, and whether each key the provider allows is set. With a setting name (provider, typesafe_key, openrouter_key, small_model, large_model) it returns how the person changes that setting. It changes nothing and never returns a key.",
	);
	assert.equal(
		texts.help.provider,
		"Type /model-router-provider <value> in the chat.\nprovider: use one of auto, openrouter-first, typesafe, openrouter",
	);
});
