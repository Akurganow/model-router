import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_ROLE, prepareBrief, roleText } from "../../core/brief.ts";
import { LINE_PREFIX, skippedLine } from "../../core/line.ts";
import {
	KEY_UNSET,
	outsideCoreScope,
	setsOwnModel,
	UNREADABLE,
} from "../../core/reasons.ts";
import type { Levels } from "./fakes.ts";
import {
	CONTEXT,
	field,
	JEV,
	lines,
	REQUESTER,
	setup,
	TASK,
} from "./handler-fakes.ts";
import { SPAWN_TOOL } from "./router.ts";
import { PLUGIN_ID } from "./settings.ts";
import type { BeforeToolCallResult } from "./types.ts";

// The `DECISION_LINE` pattern of scripts/evals/claude.ts, which the evals read the decision line with.
const DECISION_LINE =
	/^(?:model-router )?L(?<tier>[012]) (?<target>\S+) · (?<effort>caller effort|[^\s·]+) · p=\d+(?:\.\d+)?\/\d+(?:\.\d+)?/;

describe("levels and efforts", () => {
	const cases: [Levels, BeforeToolCallResult | undefined, string][] = [
		[
			{ tier: 0, work: 0 },
			{ params: { model: "openai/small", thinking: "medium" } },
			"model-router L0 openai/small · medium · p=0.90/0.90",
		],
		[
			{ tier: 0, work: 2 },
			{ params: { model: "openai/small", thinking: "xhigh" } },
			"model-router L0 openai/small · xhigh · p=0.90/0.90",
		],
		[
			{ tier: 1, work: 0 },
			{ params: { thinking: "low" } },
			"model-router L1 no change · low · p=0.90/0.90",
		],
		[
			{ tier: 1, work: 1 },
			{ params: { thinking: "medium" } },
			"model-router L1 no change · medium · p=0.90/0.90",
		],
		[
			{ tier: 2, work: 1 },
			{ params: { model: "openai/large", thinking: "medium" } },
			"model-router L2 openai/large · medium · p=0.90/0.90",
		],
		[
			{ tier: 2, work: 2 },
			{ params: { model: "openai/large", thinking: "high" } },
			"model-router L2 openai/large · high · p=0.90/0.90",
		],
	];
	for (const [levels, expected, line] of cases)
		it(`tier ${levels.tier} work ${levels.work} returns ${JSON.stringify(expected)}`, async () => {
			const s = setup({ levels });
			assert.deepEqual(await s.call(), expected);
			assert.deepEqual(lines(s), [line + JEV]);
		});

	it("sets only efforts of the documented ladder", async () => {
		const seen = new Set<unknown>();
		for (const tier of [0, 1, 2])
			for (const work of [0, 1, 2]) {
				const result = await setup({ levels: { tier, work } }).call();
				seen.add(field(result?.params, "thinking"));
			}
		assert.deepEqual([...seen].sort(), ["high", "low", "medium", "xhigh"]);
	});

	it("never returns anything but params", async () => {
		for (const tier of [0, 1, 2]) {
			const result = await setup({ levels: { tier, work: 1 } }).call();
			assert.deepEqual(Object.keys(result ?? {}), ["params"]);
		}
	});

	it("writes routed lines of levels 0 and 2 that the eval pattern reads", async () => {
		for (const tier of [0, 2]) {
			const s = setup({ levels: { tier, work: 1 } });
			await s.call();
			const match = DECISION_LINE.exec(lines(s)[0] ?? "");
			assert.equal(field(match?.groups, "tier"), String(tier));
			assert.equal(
				field(match?.groups, "target"),
				tier === 0 ? "openai/small" : "openai/large",
			);
			assert.equal(
				field(match?.groups, "effort"),
				tier === 0 ? "high" : "medium",
			);
		}
	});

	it("trims the assigned model string", async () => {
		const s = setup({
			levels: { tier: 0, work: 1 },
			settings: { small_model: "  openai/small  " },
		});
		assert.equal(field((await s.call())?.params, "model"), "openai/small");
	});
});

describe("the slot and model each level takes", () => {
	const MODELS = { small: "openai/small", large: "openai/large" };
	type Models = { small?: string; large?: string };
	// Level 1 changes no model, so it needs neither slot; an end level needs its own slot only.
	// The effort is the ladder's for the work level 1.
	type Row = {
		readonly tier: 0 | 1 | 2;
		readonly set: Models;
		readonly result: BeforeToolCallResult;
		readonly line: string;
	};
	const routedLog = (target: string, effort: string, tier: number) =>
		`${LINE_PREFIX}L${tier} ${target} · ${effort} · p=0.90/0.90${JEV}`;

	const ROWS: readonly Row[] = [
		{
			tier: 0,
			set: MODELS,
			result: { params: { model: "openai/small", thinking: "high" } },
			line: routedLog("openai/small", "high", 0),
		},
		{
			tier: 0,
			set: { small: MODELS.small },
			result: { params: { model: "openai/small", thinking: "high" } },
			line: routedLog("openai/small", "high", 0),
		},
		{
			tier: 1,
			set: { small: MODELS.small },
			result: { params: { thinking: "medium" } },
			line: routedLog("no change", "medium", 1),
		},
		{
			tier: 2,
			set: { large: MODELS.large },
			result: { params: { model: "openai/large", thinking: "medium" } },
			line: routedLog("openai/large", "medium", 2),
		},
	];

	const settings = ({ small = "", large = "" }: Models) => ({
		small_model: small,
		large_model: large,
	});
	const name = (set: Models) =>
		[set.small && "small", set.large && "large"]
			.filter(Boolean)
			.join(" and ") || "no";

	for (const { tier, set, result, line } of ROWS)
		it(`level ${tier} with ${name(set)} model set returns ${JSON.stringify(result)}`, async () => {
			const s = setup({
				levels: { tier, work: 1 },
				settings: settings(set),
			});
			assert.deepEqual(await s.call(), result);
			assert.deepEqual(lines(s), [line]);
		});

	for (const tier of [0, 1, 2] as const)
		it(`level ${tier} with both models unset skips before Jev is asked`, async () => {
			const s = setup({
				levels: { tier, work: 1 },
				settings: settings({}),
			});
			assert.equal(await s.call(), undefined);
			assert.deepEqual(lines(s), skippedLog("no small or large model"));
			assert.equal(s.jev.requests.length, 0);
		});

	it("level 1 routes with an unresolved model, and no check runs", async () => {
		const s = setup({ levels: { tier: 1, work: 1 } });
		s.runtime.answers.resolved = { error: "not allowed" };
		s.runtime.answers.credential = false;
		assert.deepEqual(await s.call(), { params: { thinking: "medium" } });
		assert.deepEqual(lines(s), [routedLog("no change", "medium", 1)]);
	});
});

describe("kept effort", () => {
	it("keeps the caller's thinking and routes the model", async () => {
		const s = setup({ levels: { tier: 0, work: 1 } });
		assert.deepEqual(await s.call({ thinking: "low" }), {
			params: { model: "openai/small" },
		});
		assert.deepEqual(lines(s), [
			`model-router L0 openai/small · caller effort · p=0.90/0.90${JEV}`,
		]);
	});

	it("keeps a configured global effort", async () => {
		const s = setup({
			levels: { tier: 2, work: 1 },
			config: { agents: { defaults: { subagents: { thinking: "low" } } } },
		});
		assert.deepEqual(await s.call(), { params: { model: "openai/large" } });
		assert.match(lines(s)[0] ?? "", /L2 openai\/large · config effort · /);
	});

	it("at level 1 with a kept effort returns nothing and logs the line", async () => {
		const s = setup({ levels: { tier: 1, work: 1 } });
		assert.equal(await s.call({ thinking: "high" }), undefined);
		assert.deepEqual(lines(s), [
			`model-router L1 no change · caller effort · p=0.90/0.90${JEV}`,
		]);
	});
});

describe("what Jev is asked", () => {
	const bodyOf = (s: ReturnType<typeof setup>) =>
		s.jev.requests[0]?.body as { state: unknown; questions: object };
	const stateOf = (s: ReturnType<typeof setup>) => bodyOf(s).state;

	it("sends one request holding the role, an empty description and the prepared task", async () => {
		const s = setup();
		await s.call();
		assert.equal(s.jev.requests.length, 1);
		assert.deepEqual(stateOf(s), {
			role: DEFAULT_ROLE,
			description: "",
			task: prepareBrief(TASK),
		});
		assert.deepEqual(Object.keys(bodyOf(s).questions), ["tier", "work"]);
	});

	it("describes the spawn by its label, else its task name", async () => {
		const labelled = setup();
		await labelled.call({ label: "docs", taskName: "write" });
		assert.equal(
			(stateOf(labelled) as { description: string }).description,
			"docs",
		);
		const named = setup();
		await named.call({ label: 3, taskName: "write" });
		assert.equal(
			(stateOf(named) as { description: string }).description,
			"write",
		);
	});

	// The key is joined at run time, so the owner-setup scan reads no key here.
	it("masks the label and the task name like the task text", async () => {
		const key = ["sk", "a1B2c3D4e5F6g7H8"].join("-");
		const labelled = setup();
		await labelled.call({ label: `docs ${key}`, taskName: "write" });
		assert.equal(
			(stateOf(labelled) as { description: string }).description,
			"docs ***",
		);
		const named = setup();
		await named.call({ taskName: `write ${key}` });
		assert.equal(
			(stateOf(named) as { description: string }).description,
			"write ***",
		);
	});

	it("sends the requester's description as the role of the requesting agent itself", async () => {
		const s = setup({
			config: {
				agents: { entries: { [REQUESTER]: { description: "Plans releases" } } },
			},
		});
		await s.call();
		assert.equal(
			(stateOf(s) as { role: string }).role,
			roleText("Plans releases"),
		);
	});

	it("scores another agent under extended with that agent's description and resolves for it", async () => {
		const s = setup({
			levels: { tier: 0, work: 1 },
			settings: { scope: "extended" },
			config: {
				agents: { entries: { writer: { description: "Writes docs" } } },
			},
		});
		const result = await s.call({ agentId: "writer" });
		assert.equal(field(result?.params, "model"), "openai/small");
		assert.equal(
			(stateOf(s) as { role: string }).role,
			roleText("Writes docs"),
		);
		assert.equal(s.runtime.calls.defaultModel[0]?.agentId, "writer");
	});

	it("reads the live config on each spawn, so a command's write takes effect", async () => {
		const s = setup({ levels: { tier: 0, work: 1 } });
		s.runtime.answers.config = {
			plugins: {
				entries: { [PLUGIN_ID]: { config: { small_model: "x/new" } } },
			},
		};
		assert.equal(field((await s.call())?.params, "model"), "x/new");
	});
});

// The gate tests pin each reason. These tests pin that the router reaches the gate and logs its reason.
const skippedLog = (reason: string) => [LINE_PREFIX + skippedLine(reason)];

describe("gates and skips", () => {
	it("passes a spawn silently: no request, no line", async () => {
		const s = setup();
		assert.equal(await s.call({ model: "openai/own" }), undefined);
		assert.equal(s.jev.requests.length, 0);
		assert.deepEqual(lines(s), []);
	});

	it("ignores another tool", async () => {
		const s = setup();
		const result = await s.handler(
			{ toolName: "exec", params: { task: TASK } },
			CONTEXT,
		);
		assert.equal(result, undefined);
		assert.equal(s.jev.requests.length, 0);
	});

	it("skips with no key", async () => {
		const s = setup({ settings: { api_key: "" } });
		assert.equal(await s.call(), undefined);
		assert.deepEqual(lines(s), [`model-router skipped, ${KEY_UNSET}`]);
		assert.equal(s.jev.requests.length, 0);
	});

	it("reads a key from the environment", async () => {
		const s = setup({
			settings: { api_key: "" },
			env: { TYPESAFE_API_KEY: "from-env" },
		});
		assert.ok(await s.call());
	});

	it("skips with neither model slot set", async () => {
		const s = setup({ settings: { small_model: "", large_model: "" } });
		assert.equal(await s.call(), undefined);
		assert.deepEqual(lines(s), skippedLog("no small or large model"));
	});

	it("skips another agent with no key before the scope, so the key is the reason", async () => {
		const s = setup({ settings: { api_key: "" } });
		assert.equal(await s.call({ agentId: "writer" }), undefined);
		assert.deepEqual(lines(s), skippedLog(KEY_UNSET));
		assert.equal(s.jev.requests.length, 0);
	});

	it("skips another agent under core", async () => {
		const s = setup();
		assert.equal(await s.call({ agentId: "writer" }), undefined);
		assert.deepEqual(lines(s), skippedLog(outsideCoreScope("writer")));
	});

	it("skips a spawn that names its agent as agent_id, as the tool reads it", async () => {
		const s = setup({
			settings: { scope: "extended" },
			config: { agents: { entries: { worker: { model: "own/model" } } } },
		});
		assert.equal(await s.call({ agent_id: "worker" }), undefined);
		assert.deepEqual(lines(s), skippedLog(setsOwnModel("worker")));
		assert.equal(s.jev.requests.length, 0);
	});

	it("skips a spawn naming an agent when the context has no requester", async () => {
		const s = setup();
		assert.equal(
			await s.call({ agentId: REQUESTER }, { toolName: SPAWN_TOOL }),
			undefined,
		);
		assert.deepEqual(lines(s), skippedLog(outsideCoreScope(REQUESTER)));
	});

	it("skips when the configured subagent model is set", async () => {
		const s = setup({
			config: { agents: { defaults: { subagents: { model: "x/y" } } } },
		});
		assert.equal(await s.call(), undefined);
		assert.deepEqual(lines(s), skippedLog("subagent model set"));
	});

	it("skips and logs the category when Jev fails", async () => {
		const s = setup();
		s.jev.mode.current = { status: 401 };
		assert.equal(await s.call(), undefined);
		assert.deepEqual(lines(s), skippedLog("HTTP 401"));
	});

	it("skips when the picked slot is unset, and only then", async () => {
		const small = setup({
			levels: { tier: 0, work: 1 },
			settings: { small_model: "" },
		});
		assert.equal(await small.call(), undefined);
		assert.deepEqual(lines(small), skippedLog("small model unset"));
		const large = setup({
			levels: { tier: 2, work: 1 },
			settings: { large_model: "" },
		});
		assert.equal(await large.call(), undefined);
		assert.deepEqual(lines(large), skippedLog("large model unset"));
		const level1 = setup({
			levels: { tier: 1, work: 1 },
			settings: { small_model: "", large_model: "x/y" },
		});
		assert.ok(await level1.call());
	});

	it("skips when the live config cannot be read", async () => {
		const s = setup();
		s.runtime.throwOn.add("config");
		assert.equal(await s.call(), undefined);
		assert.deepEqual(lines(s), skippedLog(UNREADABLE));
	});
});

describe("model checks", () => {
	it("leaves the call alone when the model does not resolve", async () => {
		const s = setup({ levels: { tier: 0, work: 1 } });
		s.runtime.answers.resolved = { error: "not allowed" };
		assert.equal(await s.call(), undefined);
		assert.deepEqual(lines(s), skippedLog("small model unresolved"));
	});

	it("leaves the call alone when the credential reads false, for the large slot too", async () => {
		const s = setup({ levels: { tier: 2, work: 1 } });
		s.runtime.answers.credential = false;
		assert.equal(await s.call(), undefined);
		assert.deepEqual(lines(s), skippedLog("large model unresolved"));
	});

	it("checks for the requester with its agent directory", async () => {
		const s = setup({ levels: { tier: 0, work: 1 } });
		await s.call();
		assert.equal(s.runtime.calls.defaultModel[0]?.agentId, REQUESTER);
		assert.equal(s.runtime.calls.credential[0]?.agentDir, "/agents/main");
	});

	it("checks every model against the live config it gated on", async () => {
		const config = { agents: { entries: { [REQUESTER]: {} } } };
		const s = setup({ levels: { tier: 0, work: 1 }, config });
		assert.ok(await s.call());
		const { defaultModel, allowedRef, credential } = s.runtime.calls;
		assert.equal(defaultModel[0]?.cfg, config);
		assert.equal(allowedRef[0]?.cfg, config);
		assert.equal(credential[0]?.cfg, config);
	});

	it("passes no agent id and no directory when the context has none", async () => {
		const s = setup({ levels: { tier: 0, work: 1 } });
		assert.ok(await s.call({}, { toolName: SPAWN_TOOL }));
		assert.equal("agentId" in (s.runtime.calls.allowedRef[0] ?? {}), false);
		assert.equal("agentDir" in (s.runtime.calls.credential[0] ?? {}), false);
	});

	it("skips the checks at level 1", async () => {
		const s = setup({ levels: { tier: 1, work: 1 } });
		await s.call();
		assert.equal(s.runtime.calls.allowedRef.length, 0);
		assert.equal(s.runtime.calls.credential.length, 0);
	});
});
