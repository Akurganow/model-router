import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_ROLE, prepareBrief, roleText } from "./brief.ts";
import type { Levels } from "./openclaw-fakes.ts";
import {
	CONTEXT,
	field,
	JEV,
	lines,
	REQUESTER,
	setup,
	TASK,
} from "./openclaw-handler-fakes.ts";
import { SPAWN_TOOL } from "./openclaw-router.ts";
import { PLUGIN_ID } from "./openclaw-settings.ts";
import type { BeforeToolCallResult } from "./openclaw-types.ts";

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
		assert.deepEqual(lines(s), ["model-router skipped, key unset"]);
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
		assert.deepEqual(lines(s), [
			"model-router skipped, no small or large model",
		]);
	});

	it("skips another agent under core", async () => {
		const s = setup();
		assert.equal(await s.call({ agentId: "writer" }), undefined);
		assert.deepEqual(lines(s), [
			"model-router skipped, writer is outside the core scope",
		]);
	});

	it("skips a spawn that names its agent as agent_id, as the tool reads it", async () => {
		const s = setup({
			settings: { scope: "extended" },
			config: { agents: { entries: { worker: { model: "own/model" } } } },
		});
		assert.equal(await s.call({ agent_id: "worker" }), undefined);
		assert.deepEqual(lines(s), [
			"model-router skipped, worker sets its own model",
		]);
		assert.equal(s.jev.requests.length, 0);
	});

	it("skips a spawn naming an agent when the context has no requester", async () => {
		const s = setup();
		assert.equal(
			await s.call({ agentId: REQUESTER }, { toolName: SPAWN_TOOL }),
			undefined,
		);
		assert.match(lines(s)[0] ?? "", /main is outside the core scope/);
	});

	it("skips when the configured subagent model is set", async () => {
		const s = setup({
			config: { agents: { defaults: { subagents: { model: "x/y" } } } },
		});
		assert.equal(await s.call(), undefined);
		assert.deepEqual(lines(s), ["model-router skipped, subagent model set"]);
	});

	it("skips and logs the category when Jev fails", async () => {
		const s = setup();
		s.jev.mode.current = { status: 401 };
		assert.equal(await s.call(), undefined);
		assert.deepEqual(lines(s), ["model-router skipped, HTTP 401"]);
	});

	it("skips when the picked slot is unset, and only then", async () => {
		const small = setup({
			levels: { tier: 0, work: 1 },
			settings: { small_model: "" },
		});
		assert.equal(await small.call(), undefined);
		assert.deepEqual(lines(small), ["model-router skipped, small model unset"]);
		const large = setup({
			levels: { tier: 2, work: 1 },
			settings: { large_model: "" },
		});
		assert.equal(await large.call(), undefined);
		assert.deepEqual(lines(large), ["model-router skipped, large model unset"]);
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
		assert.deepEqual(lines(s), ["model-router skipped, settings unreadable"]);
	});
});

describe("model checks", () => {
	it("leaves the call alone when the model does not resolve", async () => {
		const s = setup({ levels: { tier: 0, work: 1 } });
		s.runtime.answers.resolved = { error: "not allowed" };
		assert.equal(await s.call(), undefined);
		assert.deepEqual(lines(s), [
			"model-router skipped, small model unresolved",
		]);
	});

	it("leaves the call alone when the credential reads false, for the large slot too", async () => {
		const s = setup({ levels: { tier: 2, work: 1 } });
		s.runtime.answers.credential = false;
		assert.equal(await s.call(), undefined);
		assert.deepEqual(lines(s), [
			"model-router skipped, large model unresolved",
		]);
	});

	it("checks for the requester with its agent directory", async () => {
		const s = setup({ levels: { tier: 0, work: 1 } });
		await s.call();
		assert.equal(s.runtime.calls.defaultModel[0]?.agentId, REQUESTER);
		assert.equal(s.runtime.calls.credential[0]?.agentDir, "/agents/main");
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
