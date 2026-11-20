import assert from "node:assert/strict";
import { test } from "node:test";
import type { Part } from "#core/parts/part.ts";
import { tier } from "#core/parts/tier.ts";
import { work } from "#core/parts/work.ts";
import { SYSTEM_ONE } from "#core/scoring/formats/system-one.ts";

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

const read = (parts: readonly Part[], reply: unknown) =>
	SYSTEM_ONE.read(parts, JSON.stringify({ answers: reply }));

const BAD_REPLY = { failure: "malformed" };

test("a missing, empty or non-score answer is a bad reply", () => {
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
		assert.deepEqual(read([work], answerSet), BAD_REPLY);
});

test("one probability per offered level: fewer or more is a bad reply", () => {
	for (const tierP of [
		{ "0": 0.5, "1": 0.5 },
		{ "0": 0.25, "1": 0.25, "2": 0.25, "3": 0.25 },
		{ "0": 0.5, "1": 0.5, x: 0 },
	])
		assert.deepEqual(read([tier], answers(tierP)), BAD_REPLY);
});

// JSON text turns NaN and the infinities into null, which is no number either.
test("a value that is no number from 0 to 1 is a bad reply", () => {
	for (const bad of [
		"a",
		Number.NaN,
		Number.POSITIVE_INFINITY,
		Number.NEGATIVE_INFINITY,
		-0.1,
		1.1,
	])
		assert.deepEqual(
			read(
				[work],
				answers({ "0": 1, "1": 0, "2": 0 }, { "0": bad, "1": 0, "2": 0 }),
			),
			BAD_REPLY,
			String(bad),
		);
	assert.deepEqual(
		read([tier], answers({ "0": Number.NaN, "1": -5, "2": 99 })),
		BAD_REPLY,
	);
	const edges = { "0": 0, "1": 1, "2": 0 };
	assert.deepEqual(read([tier], answers(edges)), {
		answers: [[tier, edges]],
		model: undefined,
		usage: undefined,
	});
});
