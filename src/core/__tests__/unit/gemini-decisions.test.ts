import assert from "node:assert/strict";
import { test } from "node:test";
import { STATE, TIER, WORK } from "#core/__tests__/support/format-inputs.ts";
import { GEMINI_DECISIONS } from "#core/scoring/formats/gemini-decisions.ts";

const REPLY = `{"answers":{"tier":{"confidence":0.8304925354943326,"score":1.8205809657551977,"probabilities":{"2":0.8304925354943326,"1":0.15959589476653246,"0":0.009911569739134969},"legend":{"1":"Bounded judgment: the brief fixes the goal and a way to check the result. Check work against stated requirements, fix named defects, implement from a given plan or spec, or answer a question from a few named files.","0":"Lookup or transcription: the brief names the exact files to read or string to find, or holds the exact code, config or prose to write. It gives the commands to run and the check that proves the work done. No choice is left.","2":"Open judgment: the brief leaves the approach open. Decide a design, create content with no plan or spec to follow, review a multi-file change for risks no checklist names, or debug with an unclear cause."},"type":"score"},"work":{"confidence":0.5572292731894598,"score":1.2755738063965518,"probabilities":{"2":0.35917226660354606,"0":0.08359846020699421,"1":0.5572292731894598},"legend":{"0":"A short task: one or two mechanical steps in one place, nothing to diagnose, and the given command is the whole check.","1":"An ordinary task: reading or diagnosing code, a few steps or files, and a result to verify.","2":"A long or delicate task: many steps or files, hidden edge cases, or a wrong result that would look right."},"type":"score"}},"usage":{"total_tokens":430,"total_input_tokens":430,"input_tokens_by_modality":[{"modality":"text","tokens":430}],"total_output_tokens":0}}`;
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
