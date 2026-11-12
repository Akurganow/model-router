// Pins the decision code as it behaves today, so a move into shared modules can prove it changed nothing.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ROUTING_LIMIT_MS } from "../core/compose.ts";
import { plan } from "../core/provider.ts";
import { routedCall, SPAWN } from "./claude/fakes.ts";
import { useWorld } from "./omp/fakes.ts";
import type { Batch } from "./omp/gates.ts";
import { type Pending, scoreItems } from "./omp/score.ts";

type Reply = {
	status: number;
	ok: boolean;
	headers: Record<string, string>;
	text: string;
};
type Answers = { tier?: number; work?: number; model?: string; usage?: object };

const scores = (level: number) => ({
	type: "score",
	probabilities: { 0: 0.05, 1: 0.05, 2: 0.05, [level]: 0.9 },
});

/**
 * Returns the fake Jev reply with status 200. Its body holds a tier answer when
 * tier is given, a work answer when work is given, and the model and usage as
 * passed.
 */
const answer = ({ tier, work, model, usage }: Answers): Reply => ({
	status: 200,
	ok: true,
	headers: {},
	text: JSON.stringify({
		model,
		usage,
		answers: {
			...(tier === undefined ? {} : { tier: scores(tier) }),
			...(work === undefined ? {} : { work: scores(work) }),
		},
	}),
});

const TOKENS = { input_tokens: 812, output_tokens: 9 };
const FULL = { model: "jev-1.14.0", usage: TOKENS };
const FULL_SUFFIX = " · jev jev-1.14.0 · 812/9 tok";

type Run = {
	options?: Record<string, unknown>;
	env?: Record<string, string>;
	callerEffort?: boolean;
	reply: (url: string) => Reply;
};

/**
 * Runs one routed spawn and returns the logged lines, the spawn the engine
 * received and the effort its model requests carry. Sends a caller effort with
 * the tool call when callerEffort is true. The logged lines leave out what goes
 * to the debug log.
 */
const spawnOnce = ({ options, env = {}, callerEffort, reply }: Run) =>
	routedCall(
		{ api_key: "ts-key", ...options },
		env,
		undefined,
		undefined,
		undefined,
		{ reply, callerEffort },
	);

const routed = (answers: Answers, run: Partial<Run> = {}) =>
	spawnOnce({ ...run, reply: () => answer(answers) });

// Rows are the tier level, columns the work level. The values are written out, not read from the ladder.
const LADDER = [
	["haiku", ["medium", "high", "xhigh"]],
	["sonnet", ["low", "medium", "high"]],
	["opus", ["low", "medium", "high"]],
] as const;

describe("Claude Code decision for each tier and work level", () => {
	for (const [tier, [model, efforts]] of LADDER.entries())
		for (const [work, effort] of efforts.entries())
			test(`tier ${tier} and work ${work} give ${model} at ${effort}`, async () => {
				const { logs, spawned, requestEffort } = await routed({
					tier,
					work,
					...FULL,
				});
				assert.deepEqual(logs, [
					`L${tier} ${model} · ${effort} · p=0.90/0.90${FULL_SUFFIX}`,
				]);
				assert.equal(spawned?.model, model);
				assert.equal(requestEffort, effort);
			});
});

describe("Claude Code reply and effort edge cases", () => {
	for (const missing of ["tier", "work"] as const)
		test(`a reply without the ${missing} part skips and leaves the spawn alone`, async () => {
			const answers = { tier: 1, work: 1, ...FULL, [missing]: undefined };
			const { logs, spawned, requestEffort } = await routed(answers);
			assert.deepEqual(logs, ["skipped, bad reply"]);
			assert.deepEqual(spawned, SPAWN);
			assert.equal(requestEffort, "max");
		});

	test("a caller-set effort is logged in place of the effort and applies none", async () => {
		const { logs, spawned, requestEffort } = await routed(
			{ tier: 2, work: 0, ...FULL },
			{ callerEffort: true },
		);
		assert.deepEqual(logs, [
			`L2 opus · caller effort · p=0.90/0.90${FULL_SUFFIX}`,
		]);
		assert.equal(spawned?.model, "opus");
		assert.equal(requestEffort, "max");
	});

	test("an effort in CLAUDE_CODE_EFFORT_LEVEL is logged in place of the effort and applies none", async () => {
		const { logs, spawned, requestEffort } = await routed(
			{ tier: 0, work: 2, ...FULL },
			{ env: { CLAUDE_CODE_EFFORT_LEVEL: "high" } },
		);
		assert.deepEqual(logs, [
			`L0 haiku · env effort · p=0.90/0.90${FULL_SUFFIX}`,
		]);
		assert.equal(spawned?.model, "haiku");
		assert.equal(requestEffort, "max");
	});
});

describe("decision line suffix", () => {
	const line = async (extra: Answers, run: Partial<Run> = {}) =>
		(await routed({ tier: 1, work: 1, ...extra }, run)).logs[0];
	const BASE = "L1 sonnet · medium · p=0.90/0.90";

	test("the Jev model and the token counts follow the probabilities", async () => {
		assert.equal(await line(FULL), `${BASE}${FULL_SUFFIX}`);
	});

	test("a reply with a model and no usage names the model alone", async () => {
		assert.equal(
			await line({ model: "jev-1.14.0" }),
			`${BASE} · jev jev-1.14.0`,
		);
	});

	test("a reply with no model and no usage adds nothing", async () => {
		assert.equal(await line({}), BASE);
	});

	test("a model name keeps only safe characters", async () => {
		assert.equal(await line({ model: "jev 1.14!" }), `${BASE} · jev jev1.14`);
	});

	test("usage with one count, or a count that is not a whole number, adds no tokens", async () => {
		assert.equal(await line({ usage: { input_tokens: 5 } }), BASE);
		assert.equal(
			await line({ usage: { input_tokens: 5, output_tokens: 1.5 } }),
			BASE,
		);
	});

	test("an answer from the second provider names the first and its reason", async () => {
		const { logs } = await spawnOnce({
			options: { provider: "auto", openrouter_api_key: "or-key" },
			reply: (url) =>
				url.includes("typesafe")
					? { status: 401, ok: false, headers: {}, text: "{}" }
					: answer({ tier: 1, work: 1, ...FULL }),
		});
		assert.deepEqual(logs, [
			`${BASE}${FULL_SUFFIX} · via openrouter (typesafe HTTP 401)`,
		]);
	});
});

describe("omp per-item line", () => {
	const world = useWorld();
	const batch = (): Batch => ({
		attempts: plan("typesafe", { typesafe: true, openrouter: false }),
		keys: { typesafe: "ts-key" },
		facts: {
			scope: "core",
			roles: {},
			overrides: {},
			disabled: [],
			agents: world.agents,
			noModels: undefined,
			maxEffort: undefined,
			effortEnabled: false,
		},
	});
	const lines = async (tasks: [string, string?][]) => {
		const items: Pending[] = tasks.map(([task, agent], index) => ({
			index,
			item: { task },
			agent: agent ?? "task",
		}));
		return (await scoreItems(items, "", batch(), ROUTING_LIMIT_MS)).map(
			({ stored }) => ({ role: stored.routed?.role, line: stored.line }),
		);
	};

	test("level 0 names @smol, level 1 changes nothing and level 2 names @slow", async () => {
		assert.deepEqual(await lines([["level0 a"], ["level1 b"], ["level2 c"]]), [
			{ role: "@smol", line: `L0 @smol · high · p=0.90/0.90${FULL_SUFFIX}` },
			{
				role: undefined,
				line: `L1 no change · medium · p=0.90/0.90${FULL_SUFFIX}`,
			},
			{ role: "@slow", line: `L2 @slow · medium · p=0.90/0.90${FULL_SUFFIX}` },
		]);
	});

	test("an item the check skips sends nothing and carries its reason", async () => {
		assert.deepEqual(await lines([["level2 a", "reviewer"]]), [
			{
				role: undefined,
				line: "skipped, reviewer is outside the core scope",
			},
		]);
		assert.deepEqual(world.sent, []);
	});
});
