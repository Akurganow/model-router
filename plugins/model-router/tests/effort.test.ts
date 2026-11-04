import { expect, test } from "claude-code/testing";
import { callOnce, harness, KEYED, offerAll, runAgent } from "./harness.ts";

const EXTENDED = { options: { api_key: "test-key", scope: "extended" } };
// The effort the engine sends without the plugin.
const SESSION = "max";

test(
	"a model without effort gets none, whatever the ladder picks",
	KEYED,
	async ($, on) => {
		const { h } = await callOnce($, on, {}, { sessionEffort: null });
		expect(h.received.model).toBe("haiku");
		expect(h.steps).toEqual([undefined]);
	},
);

test("the ladder's effort replaces the engine's", KEYED, async ($, on) => {
	const { h } = await callOnce($, on);
	expect(h.steps).toEqual(["high"]);
	expect(h.effortReads).toEqual(["CLAUDE_CODE_EFFORT_LEVEL"]);
});

for (const [name, env, steps] of [
	["a set value", "medium", [SESSION]],
	["an empty value", "", ["high"]],
] as const)
	test(
		`CLAUDE_CODE_EFFORT_LEVEL as ${name} ${steps[0] === SESSION ? "keeps" : "does not keep"} the engine's effort`,
		KEYED,
		async ($, on) => {
			const { h } = await callOnce(
				$,
				on,
				{},
				{ env: { CLAUDE_CODE_EFFORT_LEVEL: env } },
			);
			expect(h.received.model).toBe("haiku");
			expect(h.steps).toEqual(steps);
			if (env !== "") expect(h.logs[0]).toContain(" · env effort · ");
		},
	);

test(
	"a caller's effort stays and the variable is not read",
	KEYED,
	async ($, on) => {
		const { h } = await callOnce($, on, { effort: "low" });
		expect(h.received.model).toBe("haiku");
		expect(h.steps).toEqual(["low"]);
		expect(h.effortReads).toEqual([]);
		expect(h.logs[0]).toContain(" · caller effort · ");
	},
);

for (const [name, over, spawn] of [
	["a named agent", { name: "scout" }, {}],
	["a fork", { subagent_type: "fork" }, {}],
] as const)
	test(`${name} keeps the engine's effort`, EXTENDED, async ($, on) => {
		const { h } = await callOnce($, on, over, { spawn });
		expect(h.fetched).toBe(0);
		expect(h.steps).toEqual([SESSION]);
	});

test(
	"a subagent no spawn here routed keeps the engine's effort",
	KEYED,
	async ($, on) => {
		const { h } = await callOnce($, on);
		for await (const _ of $.turn.step({
			turnId: "turn",
			index: 1,
			model: "opus",
			effort: SESSION,
			messageCount: 1,
			agentId: "nested-by-a-plugin",
		}));
		expect(h.steps).toEqual(["high", SESSION]);
	},
);

// The spawn's flags decide before the scope does, so each row holds under both scopes.
for (const [flag, spawn] of [
	["fork", { fork: true }],
	["isTeammate", { isTeammate: true }],
	["resume", { resume: { agentId: "agent-0" } }],
	["workflow", { workflow: { runId: "wf_1", agentIndex: 1 } }],
] as const)
	for (const [scope, setup] of [
		["core", KEYED],
		["extended", EXTENDED],
	] as const)
		test(
			`${scope}: a spawn with ${flag} passes through`,
			setup,
			async ($, on) => {
				const { h } = await callOnce($, on, {}, { spawn });
				expect(h.fetched).toBe(0);
				expect(h.logs).toEqual([]);
				expect(h.spawns[0]?.model).toBeUndefined();
				expect(h.steps).toEqual([SESSION]);
			},
		);

// A caller's effort waits in the plugin for its spawn. The next call to use the id must not inherit it.
test("an unroutable spawn drops the caller's effort", KEYED, async ($, on) => {
	const h = harness(on);
	await offerAll($);
	await runAgent($, h, { name: "scout", effort: "low" });
	await runAgent($, h);
	expect(h.steps).toEqual(["low", "high"]);
});

test("a skipped spawn drops the caller's effort", KEYED, async ($, on) => {
	const h = harness(on, { replies: [{ status: 400 }, {}] });
	await offerAll($);
	await runAgent($, h, { effort: "low" });
	expect(h.logs).toEqual(["skipped, HTTP 400"]);
	await runAgent($, h);
	expect(h.steps).toEqual(["low", "high"]);
});

test(
	"a spawn the engine refuses drops the caller's effort",
	KEYED,
	async ($, on) => {
		const h = harness(on, { spawnDeny: "no" });
		await offerAll($);
		await runAgent($, h, { effort: "low" });
		expect(h.logs.at(-1)).toBe("denied");
		await runAgent($, h);
		expect(h.spawnRuns).toBe(2);
		expect(
			h.logs.filter((l) => l.includes(" · caller effort · ")),
		).toHaveLength(1);
	},
);

// The engine never spawns a call that permission rules deny, so the entry has to go with the call's error.
test(
	"a call that permission rules deny drops the caller's effort",
	KEYED,
	async ($, on) => {
		const h = harness(on, { decision: ["deny", "allow"] });
		await offerAll($);
		const denied = await runAgent($, h, { effort: "low" });
		expect(String(denied.result)).toMatch(/denied/);
		expect(h.calls).toBe(0);
		expect(h.fetched).toBe(0);
		expect(h.logs).toEqual([]);
		await runAgent($, h);
		expect(h.steps).toEqual(["high"]);
	},
);

test(
	"a failing log after the spawn does not spawn twice",
	KEYED,
	async ($, on) => {
		const { h, outcome } = await callOnce(
			$,
			on,
			{},
			{ spawnDeny: "no", logThrows: "denied" },
		);
		expect(outcome.deny).toBe("no");
		expect(h.spawnRuns).toBe(1);
	},
);
