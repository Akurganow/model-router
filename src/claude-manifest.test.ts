import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { COMMAND_DESCRIPTIONS, VALUE_SETTINGS } from "./settings.ts";

const CONFIG_TOOL = "mcp__model-router__config";

type Command = { description: string; argumentHint: string; content: string };
const manifest: { commands: Record<string, Command | undefined> } = JSON.parse(
	readFileSync(
		new URL(
			"../plugins/model-router/.claude-plugin/plugin.json",
			import.meta.url,
		),
		"utf8",
	),
);

const HINTS = {
	provider: "[auto|openrouter-first|typesafe|openrouter]",
	scope: "[core|extended]",
};

test("each command is declared, with the shared description and a hint", () => {
	assert.deepEqual(Object.keys(manifest.commands).sort(), [...VALUE_SETTINGS]);
	for (const name of VALUE_SETTINGS) {
		assert.equal(
			manifest.commands[name]?.description,
			COMMAND_DESCRIPTIONS[name],
		);
		assert.equal(manifest.commands[name]?.argumentHint, HINTS[name]);
	}
});

test("each fallback text sends Claude to the config tool", () => {
	for (const name of VALUE_SETTINGS) {
		const content = manifest.commands[name]?.content ?? "";
		assert.ok(content.includes(CONFIG_TOOL), name);
		assert.ok(content.includes(`setting "${name}"`), name);
		assert.match(content, /no setting/);
		assert.match(content, /plugin's settings/);
		assert.doesNotMatch(content, /\$ARGUMENTS|\$\d|\{\{/);
	}
});
