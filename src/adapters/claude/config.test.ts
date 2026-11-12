import assert from "node:assert/strict";
import { test } from "node:test";
import { ask, NO_ANSWER, unchanged, valueLine } from "../../core/settings.ts";
import { configCall, configCommand, resetConfig } from "./config.ts";
import type { CommandRun, Engine } from "./host.ts";

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

const CALL = { tool: "mcp__model-router__config", setting: "scope" };
const EXTENDED = ask("scope", "extended").options[0] ?? "";

// An engine whose dialogs stay open until a test answers them. Each step is logged as it starts.
function dialogs() {
	const log: string[] = [];
	const open: {
		resolve: (answer: string) => void;
		reject: (reason: Error) => void;
	}[] = [];
	const $ = {
		tool: {
			check: async () => {
				log.push("check");
				return { decision: "allow" };
			},
		},
		ui: {
			ask: () => {
				log.push("ask");
				return new Promise<string>((resolve, reject) => {
					open.push({ resolve, reject });
				});
			},
		},
		config: { set: async () => ({}) },
	} as unknown as Engine;
	return { $, log, open };
}

const idle = async () => {
	for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
};

test("a call whose dialog fails answers no answer, and the call behind it starts only after", async () => {
	resetConfig();
	const { $, log, open } = dialogs();
	const first = configCall($, CALL, {});
	const second = configCall($, CALL, {});
	await idle();
	assert.deepEqual(log, ["check", "ask"]);
	open[0]?.reject(new Error("dialog gone"));
	assert.deepEqual(await first, { result: unchanged("scope", NO_ANSWER) });
	await idle();
	assert.deepEqual(log, ["check", "ask", "check", "ask"]);
	open[1]?.resolve(EXTENDED);
	assert.deepEqual(await second, { result: valueLine("scope", "extended") });
});

test("a call that throws rejects its caller, and the call behind it still runs after", async () => {
	resetConfig();
	const { $, log, open } = dialogs();
	let release: () => void = () => undefined;
	let checks = 0;
	$.tool.check = async () => {
		checks += 1;
		log.push("check");
		if (checks === 1) {
			await new Promise<void>((resolve) => {
				release = resolve;
			});
			throw new Error("no rules");
		}
		return { decision: "allow" };
	};
	const first = configCall($, CALL, {});
	const second = configCall($, CALL, {});
	await idle();
	assert.deepEqual(log, ["check"]);
	release();
	await assert.rejects(first, { message: "no rules" });
	await idle();
	assert.deepEqual(log, ["check", "check", "ask"]);
	open[0]?.resolve(EXTENDED);
	assert.deepEqual(await second, { result: valueLine("scope", "extended") });
});

test("a reset drops a pending queue, so a call after it does not wait for an unsettled one", async () => {
	resetConfig();
	const { $, log, open } = dialogs();
	const stuck = configCall($, CALL, {});
	await idle();
	assert.deepEqual(log, ["check", "ask"]);
	resetConfig();
	const fresh = configCall($, CALL, {});
	await idle();
	assert.deepEqual(log, ["check", "ask", "check", "ask"]);
	open[1]?.resolve(EXTENDED);
	assert.deepEqual(await fresh, { result: valueLine("scope", "extended") });
	open[0]?.reject(new Error("dialog gone"));
	assert.deepEqual(await stuck, { result: unchanged("scope", NO_ANSWER) });
});
