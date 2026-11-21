import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { setupTexts } from "#adapters/hermes/setup.ts";
import {
	alreadyValue,
	commandName,
	keyLine,
	TOOL_LABEL,
	TOOL_NAME,
	unchanged,
} from "#core/options/settings.ts";
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

test("the tool and command names and texts equal the src/ values", () => {
	assert.equal(texts.toolName, TOOL_NAME);
	assert.equal(texts.toolLabel, TOOL_LABEL);
	assert.equal(texts.toolset, "model_router");
	assert.equal(texts.commandName, commandName("provider"));
	assert.equal(
		texts.commandDescription,
		"Shows or changes which providers score subagent calls: auto, openrouter-first, typesafe, openrouter.",
	);
});

test("the tool description says what it reads, changes nothing and returns no key", () => {
	assert.equal(
		texts.toolDescription,
		"Reads the router's settings. It returns the provider, the three models, and whether each key the settings allow is set. It changes nothing and never returns a key.",
	);
});

const STORED_LINES = {
	auto: "provider: auto (typesafe, then openrouter)",
	"openrouter-first": "provider: openrouter-first (openrouter, then typesafe)",
	typesafe: "provider: typesafe (typesafe)",
	openrouter: "provider: openrouter (openrouter)",
};

test("the provider texts are the lines Hermes prints", () => {
	assert.equal(
		texts.useOneOf,
		"provider: use one of auto, openrouter-first, typesafe, openrouter",
	);
	assert.equal(texts.unchangedPrefix, unchanged("provider", ""));
	for (const [value, line] of Object.entries(STORED_LINES)) {
		assert.equal(texts.providerLines[value], line);
		assert.equal(
			texts.already[value],
			unchanged("provider", alreadyValue(value)),
		);
	}
});

test("the key lines cover each provider in both states", () => {
	for (const name of KEY_HOLDERS) {
		assert.equal(texts.keyLines[name].set, keyLine(name, "set"));
		assert.equal(texts.keyLines[name].unset, keyLine(name, "unset"));
	}
	assert.equal(texts.unset, "unset");
});

test("a write from a non-local session is refused with its own reason", () => {
	assert.equal(
		texts.refused,
		unchanged("provider", "only a local session can change it"),
	);
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
