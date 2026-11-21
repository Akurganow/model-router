import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { setupTexts } from "#adapters/hermes/setup.ts";
import { keyLine, TOOL_LABEL, TOOL_NAME } from "#core/options/settings.ts";
import { KEY_HOLDERS } from "#core/providers/provider.ts";
import { renderHermes } from "./build/hermes.ts";
import { HERMES_OUTPUTS } from "./build/outputs.ts";
import { loadSource } from "./build/source.ts";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const source = loadSource(ROOT);
const rendered = renderHermes(source).find(
	({ path }) => path === HERMES_OUTPUTS.constants,
);
const { texts } = JSON.parse(rendered?.text ?? "{}");

test("the tool names and texts equal the src/ values", () => {
	assert.equal(texts.toolName, TOOL_NAME);
	assert.equal(texts.toolLabel, TOOL_LABEL);
	assert.equal(texts.toolset, "model_router");
});

test("the tool description says what it reads, changes nothing and returns no key", () => {
	assert.equal(
		texts.toolDescription,
		"Reads the router's settings. It returns the provider, the gateway, the three models, and whether each key the settings allow is set. It changes nothing and never returns a key.",
	);
});

test("the key lines cover each provider in both states", () => {
	for (const name of KEY_HOLDERS) {
		assert.equal(texts.keyLines[name].set, keyLine(name, "set"));
		assert.equal(texts.keyLines[name].unset, keyLine(name, "unset"));
	}
	assert.equal(texts.unset, "unset");
});

test("the platforms of a local session are the ones Hermes names", () => {
	assert.deepEqual(texts.localPlatforms, ["local", "cli", "tui", "desktop"]);
});

test("the slot templates and separators are the ones Python fills", () => {
	assert.equal(texts.modelLine, "{name}: {provider} {model}");
	assert.equal(texts.modelUnset, "{name}: unset");
	assert.equal(texts.lineBreak, "\n");
	assert.equal(texts.errorPrefix, "error: ");
});

test("the rendered texts equal the builder's output", () => {
	assert.deepEqual(texts, setupTexts());
});
