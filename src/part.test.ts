import assert from "node:assert/strict";
import { test } from "node:test";
import { formatProbability, parseProbabilities } from "./part.ts";

const dist = (p: Record<string, unknown>) => ({
	type: "score",
	score: 0,
	confidence: 0.9,
	legend: {},
	probabilities: p,
});

const answers = (
	tierP: Record<string, unknown>,
	workP: Record<string, unknown> = { "0": 0.2, "1": 0.6, "2": 0.2 },
) => ({ tier: dist(tierP), work: dist(workP) });

test("well-formed tier and work answers pass through as probabilities", () => {
	const tierP = { "0": 0.2, "1": 0.7, "2": 0.1 };
	const workP = { "0": 0.7, "1": 0.2, "2": 0.1 };
	assert.deepEqual(parseProbabilities(answers(tierP, workP), "tier"), tierP);
	assert.deepEqual(parseProbabilities(answers(tierP, workP), "work"), workP);
});

test("a missing, empty or non-score answer has no probabilities", () => {
	const tierP = dist({ "0": 1, "1": 0, "2": 0 });
	const bodies = [
		{ tier: tierP },
		{ tier: tierP, work: { type: "score", probabilities: null } },
		{
			tier: tierP,
			work: { type: "label", probabilities: { "0": 1, "1": 0, "2": 0 } },
		},
	];
	for (const answerSet of bodies)
		assert.equal(parseProbabilities(answerSet, "work"), undefined);
});

test("one probability per offered level: fewer or more has no probabilities", () => {
	for (const tierP of [
		{ "0": 0.5, "1": 0.5 },
		{ "0": 0.25, "1": 0.25, "2": 0.25, "3": 0.25 },
		{ "0": 0.5, "1": 0.5, x: 0 },
	])
		assert.equal(parseProbabilities(answers(tierP), "tier"), undefined);
});

test("three work probabilities are required", () => {
	const short = answers({ "0": 1, "1": 0, "2": 0 }, { "0": 0.5, "1": 0.5 });
	assert.equal(parseProbabilities(short, "work"), undefined);
});

test("a non-numeric probability has no probabilities", () => {
	const text = answers(
		{ "0": 1, "1": 0, "2": 0 },
		{ "0": "a", "1": 0, "2": 0 },
	);
	assert.equal(parseProbabilities(text, "work"), undefined);
});

test("a probability prints with two decimals", () => {
	assert.equal(formatProbability(0.9), "0.90");
	assert.equal(formatProbability(0.126), "0.13");
	assert.equal(formatProbability(1), "1.00");
});
