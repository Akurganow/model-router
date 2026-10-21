import assert from "node:assert/strict";
import { test } from "node:test";
import { BUDGET_CHARS, score, TIER_TEXTS, WORK_TEXTS } from "./core.ts";

type Question = {
	type: string;
	instructions: string;
	criteria: readonly string[];
};
type Body = {
	model: string;
	state: { role: string; description: string; task: string };
	questions: { tier: Question; work: Question };
};

const dist = (p: Record<string, number>) => ({
	type: "score",
	score: 0,
	confidence: 0.9,
	legend: {},
	probabilities: p,
});

const answer = (
	tier: Record<string, number>,
	work: Record<string, number> = { "0": 0.2, "1": 0.6, "2": 0.2 },
) =>
	JSON.stringify({
		model: "jev-1.14.0",
		answers: { tier: dist(tier), work: dist(work) },
		usage: { input_tokens: 1, output_tokens: 1 },
	});

const input = (prompt: string) => ({
	role: "general-purpose",
	description: "task",
	prompt,
	model: "jev-latest",
});

// Runs score against a stub that records the request body it was sent.
const run = async (
	prompt: string,
	text = answer({ "0": 1, "1": 0, "2": 0 }),
) => {
	const sent: { body?: Body } = {};
	const result = await score(input(prompt), TIER_TEXTS, async (body) => {
		sent.body = JSON.parse(body);
		return text;
	});
	return { result, body: sent.body as Body };
};

const levelOf = async (tier: Record<string, number>) => {
	const { result } = await run("x", answer(tier));
	assert.ok("level" in result);
	return result.level;
};

test("a fenced block becomes a one-line size note", async () => {
	const { body } = await run(
		"Write this file:\n```ts\nconst a = 1\nconst b = 2\nconst c = 3\n```\nThen run the tests.",
	);
	assert.match(
		body.state.task,
		/\[an exact block of 3 lines is given verbatim\]/,
	);
	assert.doesNotMatch(body.state.task, /const a = 1/);
});

test("runs of blank lines collapse and the text is cut at the budget", async () => {
	const { body } = await run(`a\n\n\n\nb${"x".repeat(BUDGET_CHARS * 2)}`);
	assert.ok(body.state.task.startsWith("a\n\nb"));
	assert.equal(body.state.task.length, BUDGET_CHARS);
});

test("token-shaped strings are masked and ordinary text is kept", async () => {
	const { body } = await run(
		'Use header Bearer abc.DEF-123 and key sk-abcdefghijklmnop; set API_KEY=hunter22 and DB_TOKEN: "t0k3n". Keep the config keys in order.',
	);
	const task = body.state.task;
	assert.match(task, /Bearer \*\*\*/);
	assert.doesNotMatch(task, /abc\.DEF-123|sk-abcdefghijklmnop|hunter22/);
	assert.match(task, /API_KEY=\*\*\*/);
	assert.match(task, /DB_TOKEN: \*\*\*/);
	assert.match(task, /Keep the config keys in order\./);
});

test("the request carries the given model, names the state fields and carries both questions", async () => {
	const sent: { body?: Body } = {};
	await score(
		{
			role: "reviewer",
			description: "review the diff",
			prompt: "Review it.",
			model: "jev-preview",
		},
		TIER_TEXTS,
		async (body) => {
			sent.body = JSON.parse(body);
			return answer({ "0": 1, "1": 0, "2": 0 });
		},
	);
	const body = sent.body as Body;
	assert.equal(body.model, "jev-preview");
	assert.equal(body.state.role, "reviewer");
	assert.equal(body.state.description, "review the diff");
	const { tier, work } = body.questions;
	assert.equal(tier.type, "score");
	for (const name of ["task", "role", "description"])
		assert.ok(tier.instructions.includes(`\`${name}\``));
	assert.deepEqual(tier.criteria, [...TIER_TEXTS]);
	assert.equal(work.type, "score");
	assert.ok(work.instructions.includes("`task`"));
	assert.deepEqual(work.criteria, [...WORK_TEXTS]);
});

test("the request lists the state before the questions, as the calibration was run", async () => {
	const { body } = await run("x");
	assert.deepEqual(Object.keys(body), ["model", "state", "questions"]);
	assert.deepEqual(Object.keys(body.state), ["role", "description", "task"]);
});

test("the result names the tier, the work index and both distributions", async () => {
	const { result } = await run(
		"Fix the named defect.",
		answer({ "0": 0.2, "1": 0.7, "2": 0.1 }, { "0": 0.7, "1": 0.2, "2": 0.1 }),
	);
	assert.deepEqual(result, {
		level: 1,
		workIndex: 0,
		probabilities: {
			tier: { "0": 0.2, "1": 0.7, "2": 0.1 },
			work: { "0": 0.7, "1": 0.2, "2": 0.1 },
		},
	});
});

test("a near tie goes to the highest level within the margin", async () => {
	assert.equal(await levelOf({ "0": 0.2, "1": 0.42, "2": 0.38 }), 2);
	assert.equal(await levelOf({ "0": 0.1, "1": 0.6, "2": 0.3 }), 1);
	assert.equal(await levelOf({ "0": 0.34, "1": 0.33, "2": 0.33 }), 2);
	assert.equal(await levelOf({ "0": 0.5, "1": 0.45, "2": 0.05 }), 1);
});

test("a gap of exactly the margin is not a tie", async () => {
	assert.equal(await levelOf({ "0": 0.1, "1": 0.25, "2": 0.15 }), 1);
	assert.equal(await levelOf({ "0": 0.1, "1": 0.25, "2": 0.16 }), 2);
});

test("the work index rests on the middle unless an end has more than twice its probability", async () => {
	const cases: [Record<string, number>, number][] = [
		[{ "0": 0.4, "1": 0.35, "2": 0.25 }, 1],
		[{ "0": 0.7, "1": 0.3, "2": 0 }, 0],
		[{ "0": 0, "1": 0.3, "2": 0.7 }, 2],
		[{ "0": 0.6, "1": 0.3, "2": 0.1 }, 1],
		[{ "0": 0.45, "1": 0.1, "2": 0.45 }, 2],
	];
	for (const [work, expected] of cases) {
		const { result } = await run("x", answer({ "0": 0, "1": 1, "2": 0 }, work));
		assert.ok("workIndex" in result);
		assert.equal(result.workIndex, expected);
	}
});

test("a rejecting post is a skip with its reason", async () => {
	const result = await score(input("x"), TIER_TEXTS, async () => {
		throw new Error("HTTP 500");
	});
	assert.deepEqual(result, { skipped: "HTTP 500" });
});

test("a body that is not JSON, or has no answers, is a skip", async () => {
	for (const text of ["not json", JSON.stringify({ answers: {} }), "null"]) {
		const { result } = await run("x", text);
		assert.deepEqual(result, { skipped: "malformed answer" });
	}
});

test("a missing, empty or non-score work answer is a skip", async () => {
	const tier = dist({ "0": 1, "1": 0, "2": 0 });
	const bodies = [
		{ tier },
		{ tier, work: { type: "score", probabilities: null } },
		{
			tier,
			work: { type: "label", probabilities: { "0": 1, "1": 0, "2": 0 } },
		},
	];
	for (const answers of bodies) {
		const { result } = await run("x", JSON.stringify({ answers }));
		assert.deepEqual(result, { skipped: "malformed answer" });
	}
});

test("one probability per offered tier: fewer or more is a skip", async () => {
	for (const tier of [
		{ "0": 0.5, "1": 0.5 },
		{ "0": 0.25, "1": 0.25, "2": 0.25, "3": 0.25 },
		{ "0": 0.5, "1": 0.5, x: 0 },
	]) {
		const { result } = await run("x", answer(tier));
		assert.deepEqual(result, { skipped: "malformed answer" });
	}
});

test("three work probabilities are required", async () => {
	const { result } = await run(
		"x",
		answer({ "0": 1, "1": 0, "2": 0 }, { "0": 0.5, "1": 0.5 }),
	);
	assert.deepEqual(result, { skipped: "malformed answer" });
});

test("a non-numeric probability is a skip", async () => {
	const { result } = await run(
		"x",
		JSON.stringify({
			answers: {
				tier: dist({ "0": 1, "1": 0, "2": 0 }),
				work: dist({ "0": "a", "1": 0, "2": 0 } as never),
			},
		}),
	);
	assert.deepEqual(result, { skipped: "malformed answer" });
});

// The n-tier generalisation waits for the Codex probe, so any other count is a caller bug.
test("a tier list that is not three long is a programming error", async () => {
	const post = async () => answer({ "0": 1, "1": 0, "2": 0 });
	for (const texts of [TIER_TEXTS.slice(0, 2), [...TIER_TEXTS, "extra"]])
		await assert.rejects(score(input("x"), texts as never, post), RangeError);
});

test("the calibrated data is three tier texts and three work texts", () => {
	assert.equal(TIER_TEXTS.length, 3);
	assert.equal(WORK_TEXTS.length, 3);
});

test("a post that throws a non-error is a skip with its text", async () => {
	const result = await score(input("x"), TIER_TEXTS, async () => {
		throw "boom";
	});
	assert.deepEqual(result, { skipped: "boom" });
});
