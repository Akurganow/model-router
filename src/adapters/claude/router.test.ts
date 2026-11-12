import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
	type Answers,
	FULL,
	FULL_SUFFIX,
	type Once,
	routed,
	SPAWN,
} from "./fakes.ts";

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
	const line = async (extra: Answers, run: Partial<Once> = {}) =>
		(await routed({ tier: 1, work: 1, ...extra }, run)).logs[0];
	const BASE = "L1 sonnet · medium · p=0.90/0.90";

	test("the Jev model and the token counts follow the probabilities", async () => {
		assert.equal(await line(FULL), `${BASE}${FULL_SUFFIX}`);
	});

	test("usage with one count, or a count that is not a whole number, adds no tokens", async () => {
		assert.equal(await line({ usage: { input_tokens: 5 } }), BASE);
		assert.equal(
			await line({ usage: { input_tokens: 5, output_tokens: 1.5 } }),
			BASE,
		);
	});
});
