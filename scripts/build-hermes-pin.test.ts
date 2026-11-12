import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { setupTexts } from "../src/adapters/hermes/setup.ts";
import { renderHermes } from "./build/hermes.ts";
import { formatRendered } from "./build/json.ts";
import { HERMES_OUTPUTS } from "./build/outputs.ts";
import { loadSource } from "./build/source.ts";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const source = loadSource(ROOT);
const texts = setupTexts(source.hermes.pluginName);
const sha256 = (text: string): string =>
	createHash("sha256").update(text).digest("hex");

test("the Hermes tool description, setting names and provider help are these exact texts", () => {
	assert.equal(
		texts.toolDescription,
		"Reads the router's settings. With no input it returns the provider, both models, and whether each key the provider allows is set. With a setting name (provider, typesafe_key, openrouter_key, small_model, large_model) it returns how the person changes that setting. It changes nothing and never returns a key.",
	);
	assert.deepEqual(texts.settings, [
		"provider",
		"typesafe_key",
		"openrouter_key",
		"small_model",
		"large_model",
	]);
	assert.equal(
		texts.help.provider,
		"Type /model-router-provider <value> in the chat.\nprovider: use one of auto, openrouter-first, typesafe, openrouter",
	);
});

test("the Hermes files render to the bytes committed and to these digests", () => {
	const digests: Record<string, string> = {
		[HERMES_OUTPUTS.constants]:
			"420fcdd5fe60a46210b1e4f075176e7594077fe061a256c87d18a1c98fecda12",
		[HERMES_OUTPUTS.manifest]:
			"d698b9d990ac23c55b612e7cd58987e00d449c7326b71974aaaee6e4928d59a5",
	};
	const rendered = renderHermes(source);
	assert.deepEqual(
		rendered.map(({ path }) => path).sort(),
		Object.keys(digests).sort(),
	);
	for (const rendering of rendered) {
		const { path } = rendering;
		const text = formatRendered(path, rendering.text, ROOT);
		assert.equal(text, readFileSync(join(ROOT, path), "utf8"), path);
		assert.equal(sha256(text), digests[path], path);
	}
});
