import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { setupTexts } from "../src/hermes-setup.ts";
import { commandName, TOOL_NAME } from "../src/openclaw-config.ts";
import {
	KEY_VARIABLES,
	PROVIDER_VALUES,
	type Provider,
} from "../src/provider.ts";
import {
	alreadyValue,
	badCall,
	COMMAND_DESCRIPTIONS,
	keyLine,
	TOOL_LABEL,
	unchanged,
	useOneOf,
	valueLine,
} from "../src/settings.ts";
import { renderHermes } from "./build/hermes.ts";
import { HERMES_OUTPUTS } from "./build/outputs.ts";
import { loadSource } from "./build/source.ts";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const source = loadSource(ROOT);
const rendered = renderHermes(source).find(
	({ path }) => path === HERMES_OUTPUTS.constants,
);
const { texts } = JSON.parse(rendered?.text ?? "{}");
const PROVIDERS: Provider[] = ["typesafe", "openrouter"];

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
		"large_model",
	]);
	assert.deepEqual(texts.slots, ["small_model", "large_model"]);
});

test("the tool description names every setting, changes nothing and returns no key", () => {
	for (const name of texts.settings)
		assert.ok(texts.toolDescription.includes(name), name);
	assert.match(texts.toolDescription, /changes nothing/);
	assert.match(texts.toolDescription, /never returns a key/);
	assert.doesNotMatch(texts.toolDescription, /scope/);
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
	for (const slot of texts.slots) {
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

test("the slot templates and separators are the ones Python fills", () => {
	assert.equal(texts.modelLine, "{name}: {provider} {model}");
	assert.equal(texts.modelUnset, "{name}: unset");
	assert.equal(texts.lineBreak, "\n");
	assert.equal(texts.errorPrefix, "error: ");
});

test("the rendered texts equal the builder's output for the plugin name", () => {
	assert.deepEqual(texts, setupTexts(source.hermes.pluginName));
});
