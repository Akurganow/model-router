import assert from "node:assert/strict";
import { test } from "node:test";
import { STATE, TIER, WORK } from "#core/__tests__/support/format-inputs.ts";
import { GEMINI_REPLY as REPLY } from "#core/__tests__/support/replies.ts";
import { GEMINI_DECISIONS } from "#core/scoring/formats/gemini-decisions.ts";

const read = (text: string) => GEMINI_DECISIONS.read([TIER, WORK], text);

test("the body names each question by its key, with the state as text", () => {
	assert.equal(
		GEMINI_DECISIONS.body([TIER, WORK], STATE, "gemini-decision-1"),
		String.raw`{"model":"gemini-decision-1","input":"{\"role\":\"coder\",\"description\":\"Fix it\",\"task\":\"Fix the bug.\"}","questions":{"tier":{"type":"score","instructions":"Rate tier.","criteria":["low","middle","high"]},"work":{"type":"score","instructions":"Rate work.","criteria":["low","middle","high"]}}}`,
	);
});

test("Google's count names are read, and a reply with no model reads with none", () => {
	assert.deepEqual(read(REPLY), {
		answers: [
			[
				TIER,
				{
					0: 0.009911569739134969,
					1: 0.15959589476653246,
					2: 0.8304925354943326,
				},
			],
			[
				WORK,
				{
					0: 0.08359846020699421,
					1: 0.5572292731894598,
					2: 0.35917226660354606,
				},
			],
		],
		model: undefined,
		usage: { input_tokens: 430, output_tokens: 0 },
	});
});

test("a 200 with no answers is a bad reply", () => {
	assert.deepEqual(
		read(
			'{"usage":{"total_tokens":430,"total_input_tokens":430,"total_output_tokens":0}}',
		),
		{ failure: "malformed" },
	);
});
