import assert from "node:assert/strict";
import { test } from "node:test";
import { NO_ANSWER, unchanged, valueLine } from "../../core/settings.ts";
import { configCall, configCommand, REFUSED, resetConfig } from "./config.ts";
import type { CommandRun, ConfigCall, Engine } from "./host.ts";

test("the refusal says nothing was read or changed", () => {
	assert.match(REFUSED, /Permission rules deny/);
	assert.match(REFUSED, /nothing was read or changed/);
});

const typed = (args: string): CommandRun => ({
	command: "model-router:scope",
	args,
	origin: { kind: "composer" },
});

const CALL = { tool: "mcp__model-router__config" };
const CORE = "core - today's routing: built-in general agents only";
const EXTENDED = "extended - also routes other agents that pass no model";
const AUTO = "auto - TypeSafe, then OpenRouter if TypeSafe fails";
const OPENROUTER_FIRST =
	"openrouter-first - OpenRouter, then TypeSafe if OpenRouter fails";
const TYPESAFE = "typesafe - TypeSafe only";
const OPENROUTER = "openrouter - OpenRouter only";

const call = (setting: string): ConfigCall => ({ ...CALL, setting });

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
	const first = configCall($, call("scope"), {});
	const second = configCall($, call("scope"), {});
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
	const first = configCall($, call("scope"), {});
	const second = configCall($, call("scope"), {});
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
	const stuck = configCall($, call("scope"), {});
	await idle();
	assert.deepEqual(log, ["check", "ask"]);
	resetConfig();
	const fresh = configCall($, call("scope"), {});
	await idle();
	assert.deepEqual(log, ["check", "ask", "check", "ask"]);
	open[1]?.resolve(EXTENDED);
	assert.deepEqual(await fresh, { result: valueLine("scope", "extended") });
	open[0]?.reject(new Error("dialog gone"));
	assert.deepEqual(await stuck, { result: unchanged("scope", NO_ANSWER) });
});

type Step = string | { ask: unknown } | { set: unknown };

// An engine that answers each dialog with `answer` and logs every host call in order.
function engine(
	answer: () => Promise<string>,
	set: () => Promise<{ deny?: string }> = async () => ({}),
) {
	const log: Step[] = [];
	const $ = {
		tool: {
			check: async () => {
				log.push("check");
				return { decision: "allow" };
			},
		},
		ui: {
			ask: async (question: string, opts: unknown) => {
				log.push({ ask: [question, opts] });
				return answer();
			},
		},
		config: {
			set: async (row: unknown) => {
				log.push({ set: row });
				return set();
			},
		},
	} as unknown as Engine;
	return { $, log };
}

test("the scope dialog offers the current value first and writes a new pick", async () => {
	resetConfig();
	const { $, log } = engine(async () => EXTENDED);
	assert.deepEqual(await configCall($, call("scope"), {}), {
		result: "scope: extended",
	});
	assert.deepEqual(log, [
		"check",
		{
			ask: [
				"Which agent calls should the router route?",
				{ options: [CORE, EXTENDED], header: "scope" },
			],
		},
		{ set: { key: "model-router.scope", value: "extended" } },
	]);
});

test("the provider dialog puts the stored value first and keeps the rest in order", async () => {
	resetConfig();
	const { $, log } = engine(async () => OPENROUTER_FIRST);
	assert.deepEqual(
		await configCall($, call("provider"), { provider: "openrouter" }),
		{ result: "provider: openrouter-first (openrouter, then typesafe)" },
	);
	assert.deepEqual(log, [
		"check",
		{
			ask: [
				"Which providers should score subagent calls?",
				{
					options: [OPENROUTER, AUTO, OPENROUTER_FIRST, TYPESAFE],
					header: "provider",
				},
			],
		},
		{ set: { key: "model-router.provider", value: "openrouter-first" } },
	]);
});

test("a dialog that rejects answers no answer and writes nothing", async () => {
	resetConfig();
	const { $, log } = engine(async () => {
		throw new Error("dialog gone");
	});
	assert.deepEqual(await configCall($, call("scope"), {}), {
		result: "scope unchanged: no answer from the dialog",
	});
	assert.deepEqual(
		log.filter((step) => typeof step === "string" || "set" in step),
		["check"],
	);
});

test("a dialog that resolves nothing answers no answer and writes nothing", async () => {
	resetConfig();
	const { $, log } = engine(async () => undefined as unknown as string);
	assert.deepEqual(await configCall($, call("scope"), {}), {
		result: "scope unchanged: no answer from the dialog",
	});
	assert.deepEqual(
		log.filter((step) => typeof step === "string" || "set" in step),
		["check"],
	);
});

test("an answer that is not a label is not offered and is never echoed", async () => {
	resetConfig();
	const { $, log } = engine(async () => "extended");
	assert.deepEqual(await configCall($, call("scope"), {}), {
		result: "scope unchanged: the answer was not one of the offered values",
	});
	assert.equal(log.length, 2);
	assert.equal(log[0], "check");
});

test("the stored value picked again says it is already set and writes nothing", async () => {
	resetConfig();
	const { $, log } = engine(async () => TYPESAFE);
	assert.deepEqual(
		await configCall($, call("provider"), { provider: "typesafe" }),
		{ result: "provider unchanged: already typesafe" },
	);
	assert.equal(log.length, 2);
});

test("the default picked while nothing is stored is written, because no stored value equals it", async () => {
	resetConfig();
	const { $, log } = engine(async () => TYPESAFE);
	assert.deepEqual(await configCall($, call("provider"), {}), {
		result: "provider: typesafe (typesafe)",
	});
	assert.deepEqual(log.at(-1), {
		set: { key: "model-router.provider", value: "typesafe" },
	});
});

test("a pick of the stored value counts as already set, and a written one counts for the next call", async () => {
	resetConfig();
	const { $, log } = engine(async () => EXTENDED);
	assert.deepEqual(await configCall($, call("scope"), { scope: "extended" }), {
		result: "scope unchanged: already extended",
	});
	assert.equal(log.length, 2);
	assert.deepEqual(await configCall($, call("scope"), {}), {
		result: "scope: extended",
	});
	assert.deepEqual(await configCall($, call("scope"), {}), {
		result: "scope unchanged: already extended",
	});
});

test("a write that is denied or throws leaves the setting unchanged", async () => {
	resetConfig();
	const denied = engine(
		async () => EXTENDED,
		async () => ({ deny: "read only" }),
	);
	assert.deepEqual(await configCall(denied.$, call("scope"), {}), {
		result: "scope unchanged: read only",
	});
	const thrown = engine(
		async () => EXTENDED,
		async () => {
			throw new Error("row gone");
		},
	);
	assert.deepEqual(await configCall(thrown.$, call("scope"), {}), {
		result: "scope unchanged: row gone",
	});
});

test("a tool call denied by the permission rules never opens the dialog", async () => {
	resetConfig();
	const { $, log } = engine(async () => EXTENDED);
	$.tool.check = async () => {
		log.push("check");
		return { decision: "deny" };
	};
	assert.deepEqual(await configCall($, call("scope"), {}), {
		deny: "Permission rules deny this tool, so nothing was read or changed.",
	});
	assert.deepEqual(log, ["check"]);
});

// The report lists the stored value, the scope and one line for each key the provider allows.
const report = async (options: Record<string, unknown>, env: Set<string>) => {
	const reads: string[] = [];
	const $ = {
		tool: { check: async () => ({ decision: "allow" }) },
		env: {
			get: async (name: string) => {
				reads.push(name);
				return env.has(name) ? "a-key" : undefined;
			},
		},
	} as unknown as Engine;
	const answer = await configCall($, CALL, options);
	return { answer, reads };
};

test("the settings report lists the values and each key the provider allows", async () => {
	resetConfig();
	const cases: [Record<string, unknown>, string[], string][] = [
		[
			{},
			[],
			"provider: undefined (typesafe)\nscope: core\ntypesafe key: unset",
		],
		[
			{ provider: "auto", scope: "extended", api_key: "k-1" },
			["OPENROUTER_API_KEY"],
			"provider: auto (typesafe, then openrouter)\nscope: extended\ntypesafe key: set\nopenrouter key: set",
		],
		[
			{ provider: "openrouter-first" },
			["TYPESAFE_API_KEY"],
			"provider: openrouter-first (openrouter, then typesafe)\nscope: core\nopenrouter key: unset\ntypesafe key: set",
		],
		[
			{ provider: "openrouter", openrouter_api_key: "k-2", api_key: "k-1" },
			[],
			"provider: openrouter (openrouter)\nscope: core\nopenrouter key: set",
		],
		[
			{ provider: "auto", api_key: "  ", openrouter_api_key: "" },
			[],
			"provider: auto (typesafe, then openrouter)\nscope: core\ntypesafe key: unset\nopenrouter key: unset",
		],
	];
	for (const [options, env, text] of cases) {
		resetConfig();
		const { answer } = await report(options, new Set(env));
		assert.deepEqual(answer, { result: text }, JSON.stringify(options));
	}
});

test("the settings report reads only the variables of the providers the value allows", async () => {
	resetConfig();
	const { reads } = await report({ provider: "openrouter" }, new Set());
	assert.deepEqual(reads, ["OPENROUTER_API_KEY"]);
});
