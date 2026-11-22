import assert from "node:assert/strict";
import { test } from "node:test";
import { STATE, TIER, WORK } from "#core/__tests__/support/format-inputs.ts";
import { OPENROUTER_REPLY as REPLY } from "#core/__tests__/support/replies.ts";
import { OPENROUTER_DECISIONS } from "#core/scoring/formats/openrouter-decisions.ts";

test("the body holds the state as text, the model and the questions by key", () => {
	assert.equal(
		OPENROUTER_DECISIONS.body(
			[TIER, WORK],
			STATE,
			"openai/gpt-6-luna-decisions",
		),
		String.raw`{"state":"{\"role\":\"coder\",\"description\":\"Fix it\",\"task\":\"Fix the bug.\"}","model":"openai/gpt-6-luna-decisions","questions":{"tier":{"type":"score","instructions":"Rate tier.","criteria":["low","middle","high"]},"work":{"type":"score","instructions":"Rate work.","criteria":["low","middle","high"]}}}`,
	);
});

test("the recorded reply reads with the dated model name and the two counts", () => {
	assert.deepEqual(OPENROUTER_DECISIONS.read([TIER, WORK], REPLY), {
		answers: [
			[TIER, { 0: 0.02, 1: 0.03, 2: 0.95 }],
			[WORK, { 0: 0.54, 1: 0.43, 2: 0.03 }],
		],
		model: "openai/gpt-6-luna-decisions-20261006",
		usage: { input_tokens: 488, output_tokens: 0 },
	});
});
