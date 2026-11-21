import assert from "node:assert/strict";
import { test } from "node:test";
import { STATE, TIER, WORK } from "#core/__tests__/support/format-inputs.ts";
import { OPENAI_REPLY as REPLY } from "#core/__tests__/support/replies.ts";
import { OPENAI_DECISIONS } from "#core/scoring/formats/openai-decisions.ts";

const ANSWERS = [
	[TIER, { 0: 0.02, 1: 0.08, 2: 0.9 }],
	[WORK, { 0: 0.56, 1: 0.4, 2: 0.04 }],
];
const USAGE = { input_tokens: 506, output_tokens: 0 };

const read = (text: string) => OPENAI_DECISIONS.read([TIER, WORK], text);
// Each bad reply is the reply above with one piece of its text replaced.
const bad = (from: string, to: string, parts = [TIER, WORK]) =>
	assert.deepEqual(OPENAI_DECISIONS.read(parts, REPLY.replace(from, to)), {
		failure: "malformed",
	});

test("the body lists each question in order, with the state as text", () => {
	assert.equal(
		OPENAI_DECISIONS.body([TIER, WORK], STATE, "gpt-6-luna"),
		String.raw`{"model":"gpt-6-luna","input":"{\"role\":\"coder\",\"description\":\"Fix it\",\"task\":\"Fix the bug.\"}","questions":[{"type":"score","name":"tier","instructions":"Rate tier.","levels":[{"label":"0","description":"low"},{"label":"1","description":"middle"},{"label":"2","description":"high"}]},{"type":"score","name":"work","instructions":"Rate work.","levels":[{"label":"0","description":"low"},{"label":"1","description":"middle"},{"label":"2","description":"high"}]}]}`,
	);
});

test("the reply is read by name and value, whatever the order", () => {
	const expected = { answers: ANSWERS, model: "gpt-6-luna", usage: USAGE };
	assert.deepEqual(read(REPLY), expected);
	const reversed = JSON.parse(REPLY);
	reversed.answers.reverse();
	for (const answer of reversed.answers) answer.probabilities.reverse();
	assert.deepEqual(read(JSON.stringify(reversed)), expected);
});

test("a refusal is a bad reply", () =>
	bad('"type":"score"', '"type":"refusal"'));

test("a probability outside 0 to 1 is a bad reply", () =>
	bad('"probability":0.9', '"probability":1.1'));

test("answers as a map, not a list, is a bad reply", () =>
	assert.deepEqual(
		OPENAI_DECISIONS.read(
			[TIER],
			'{"answers":{"0":{"type":"score","name":"tier","probabilities":[{"value":0,"probability":0.2},{"value":1,"probability":0.3},{"value":2,"probability":0.5}]}}}',
		),
		{ failure: "malformed" },
	));

test("an answer under another name is a bad reply", () =>
	bad('"name":"tier"', '"name":"other"'));

// Only tier is asked: with work asked too, its missing answer alone would fail the reply.
test("a repeated answer name is a bad reply", () =>
	bad('"name":"work"', '"name":"tier"', [TIER]));

test("a level that is no 0, 1 or 2, that repeats or that is a fourth is a bad reply", () => {
	bad('"value":1,', '"value":3,');
	bad('"value":1,', '"value":0,');
	bad('{"value":0,', '{"value":3,"label":"3","probability":0},{"value":0,');
});
