import assert from "node:assert/strict";
import { test } from "node:test";
import { STATE, TIER, WORK } from "#core/__tests__/support/format-inputs.ts";
import { OPENROUTER_DECISIONS } from "#core/scoring/formats/openrouter-decisions.ts";

// The recorded reply, without the fields that identify the request and its price.
const REPLY = `{"model":"openai/gpt-6-luna-decisions-20261006","answers":{"tier":{"type":"score","score":1.93,"legend":{"0":"Lookup or transcription: the brief names the exact files to read or string to find, or holds the exact code, config or prose to write. It gives the commands to run and the check that proves the work done. No choice is left.","1":"Bounded judgment: the brief fixes the goal and a way to check the result. Check work against stated requirements, fix named defects, implement from a given plan or spec, or answer a question from a few named files.","2":"Open judgment: the brief leaves the approach open. Decide a design, create content with no plan or spec to follow, review a multi-file change for risks no checklist names, or debug with an unclear cause."},"probabilities":{"0":0.02,"1":0.03,"2":0.95},"confidence":0.9},"work":{"type":"score","score":0.49,"legend":{"0":"A short task: one or two mechanical steps in one place, nothing to diagnose, and the given command is the whole check.","1":"An ordinary task: reading or diagnosing code, a few steps or files, and a result to verify.","2":"A long or delicate task: many steps or files, hidden edge cases, or a wrong result that would look right."},"probabilities":{"0":0.54,"1":0.43,"2":0.03},"confidence":0.27}},"usage":{"input_tokens":488,"output_tokens":0},"provider":"OpenAI"}`;

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
