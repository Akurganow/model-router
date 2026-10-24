import assert from "node:assert/strict";
import { test } from "node:test";
import { configCommand, resetConfig } from "./claude-config.ts";
import type { CommandRun, Engine } from "./claude-host.ts";

const typed = (args: string): CommandRun => ({
	command: "model-router:scope",
	args,
	origin: { kind: "composer" },
});

test("a write that throws a non-error prints the thrown text", async () => {
	resetConfig();
	const $ = {
		config: {
			set: async () => {
				throw "no row";
			},
		},
	} as unknown as Engine;
	const out = await configCommand($, typed("extended"), "scope", {});
	assert.deepEqual(out, { text: "scope unchanged: no row" });
});

test("a reset forgets what the instance wrote", async () => {
	const $ = { config: { set: async () => ({}) } } as unknown as Engine;
	await configCommand($, typed("extended"), "scope", {});
	assert.deepEqual(await configCommand($, typed(""), "scope", {}), {
		text: "scope: extended",
	});
	resetConfig();
	assert.deepEqual(await configCommand($, typed(""), "scope", {}), {
		text: "scope: core",
	});
});
