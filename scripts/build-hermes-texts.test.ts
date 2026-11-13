import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { setupTexts } from "../src/adapters/hermes/setup.ts";
import {
	KEY_VARIABLES,
	PROVIDER_VALUES,
	PROVIDERS,
} from "../src/core/provider.ts";
import {
	alreadyValue,
	badCall,
	COMMAND_DESCRIPTIONS,
	commandName,
	keyLine,
	TOOL_LABEL,
	TOOL_NAME,
	unchanged,
	useOneOf,
	valueLine,
} from "../src/core/settings.ts";
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
	assert.equal(texts.commandDescription, COMMAND_DESCRIPTIONS.provider);
	assert.deepEqual(texts.settings, [
		"provider",
		"typesafe_key",
		"openrouter_key",
		"small_model",
		"middle_model",
		"large_model",
	]);
});

test("the tool description is the text that names every setting, changes nothing and returns no key", () => {
	assert.equal(
		texts.toolDescription,
		"Reads the router's settings. With no input it returns the provider, the three models, and whether each key the provider allows is set. With a setting name (provider, typesafe_key, openrouter_key, small_model, middle_model, large_model) it returns how the person changes that setting. It changes nothing and never returns a key.",
	);
});

test("the provider texts equal the shared builders", () => {
	assert.equal(texts.useOneOf, useOneOf("provider"));
	assert.equal(texts.badCall, badCall(texts.settings));
	assert.equal(texts.unchangedPrefix, unchanged("provider", ""));
	for (const value of PROVIDER_VALUES) {
		assert.equal(texts.providerLines[value], valueLine("provider", value));
		assert.equal(
			texts.already[value],
			unchanged("provider", alreadyValue(value)),
		);
	}
});

test("the key lines cover each provider in both states", () => {
	for (const name of PROVIDERS) {
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

test("the help texts say where each setting changes and never ask for a key in chat", () => {
	assert.deepEqual(Object.keys(texts.help), texts.settings);
	assert.ok(texts.help.provider.includes(`/${texts.commandName} <value>`));
	assert.ok(texts.help.provider.includes(texts.useOneOf));
	for (const name of PROVIDERS) {
		const help = texts.help[`${name}_key`];
		assert.ok(help.includes(KEY_VARIABLES[name]), name);
		assert.match(help, /Never type a key into the chat\./);
	}
	for (const slot of ["small_model", "middle_model", "large_model"]) {
		const help = texts.help[slot];
		assert.ok(
			help.includes(
				`plugins.entries.${source.hermes.pluginName}.settings.${slot}`,
			),
			slot,
		);
		assert.match(help, /hermes config set/);
	}
});

test("the provider help is the chat command and the allowed values, one per line", () => {
	assert.equal(
		texts.help.provider,
		"Type /model-router-provider <value> in the chat.\nprovider: use one of auto, openrouter-first, typesafe, openrouter",
	);
});

test("the slot templates and separators are the ones Python fills", () => {
	assert.equal(texts.modelLine, "{name}: {provider} {model}");
	assert.equal(
		texts.modelUnresolved,
		"{name}: {provider} {model} (unresolved)",
	);
	assert.equal(texts.modelUnset, "{name}: unset");
	assert.equal(texts.lineBreak, "\n");
	assert.equal(texts.errorPrefix, "error: ");
});

test("the rendered texts equal the builder's output for the plugin name", () => {
	assert.deepEqual(texts, setupTexts(source.hermes.pluginName));
});
