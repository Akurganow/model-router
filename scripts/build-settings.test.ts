import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { renderClaude } from "./build/claude.ts";
import { renderOmp } from "./build/omp.ts";
import { CLAUDE_OUTPUTS, OMP_OUTPUTS } from "./build/outputs.ts";
import { loadSource } from "./build/source.ts";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const source = loadSource(ROOT);
const rendered = (files: { path: string; text: string }[], path: string) =>
	JSON.parse(files.find((file) => file.path === path)?.text ?? "{}");
const claude = rendered(renderClaude(source), CLAUDE_OUTPUTS.manifest);
const omp = rendered(renderOmp(source), OMP_OUTPUTS.manifest);

const MODELS_TEXT =
	"The scoring model per provider as provider:model entries for typesafe, openai or google, such as {typesafe:jev-latest, openai:gpt-6-luna}; a provider with no entry uses its default.";

test("Claude Code lists the three options, models, the removed model and the keys, in that order", () => {
	assert.deepEqual(Object.keys(claude.userConfig), [
		"provider",
		"gateway",
		"scope",
		"models",
		"model",
		"api_key",
		"openai_api_key",
		"google_api_key",
		"openrouter_api_key",
	]);
});

test("the Claude Code models option is a string that defaults to empty and lists no options", () => {
	assert.deepEqual(claude.userConfig.models, {
		type: "string",
		title: "Scoring models",
		description: MODELS_TEXT,
		default: "",
	});
});

test("the removed Claude Code model option has no default and no options, so an erase to an empty string stays allowed", () => {
	assert.deepEqual(claude.userConfig.model, {
		type: "string",
		title: "Jev model",
		description: "Removed: the setup skill moves it into models.",
	});
});

test("omp lists models after scope as a string with the shared text", () => {
	assert.deepEqual(Object.keys(omp.omp.settings), [
		"provider",
		"gateway",
		"scope",
		"models",
	]);
	assert.deepEqual(omp.omp.settings.models, {
		type: "string",
		description: MODELS_TEXT,
	});
});
