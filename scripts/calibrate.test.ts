import assert from "node:assert/strict";
import { test } from "node:test";
import { type Case, caseHead, runCase } from "./calibrate.ts";

const CASE: Case = {
	role: "coder",
	description: "Fix it",
	text: "Fix the bug. Authorization: Bearer abc.def.ghi",
	expected: 2,
	work: 1,
};
const score = (a: number, b: number, c: number) => ({
	type: "score",
	probabilities: { 0: a, 1: b, 2: c },
});
const REPLY = {
	model: "jev-1.14.0",
	answers: { tier: score(0.1, 0.2, 0.7), work: score(0.1, 0.8, 0.1) },
};

test("runCase sends the brief through the client and returns the decision", async () => {
	const seen: { url: string; body: string; signal: unknown }[] = [];
	const fetchFn = async (url: string, init: RequestInit = {}) => {
		seen.push({ url, body: String(init.body), signal: init.signal });
		return new Response(JSON.stringify(REPLY), {
			headers: { "content-type": "application/json" },
		});
	};
	const d = await runCase(CASE, "jev-latest", "test-key", fetchFn);
	assert.ok(!("skipped" in d));
	const { tier, work } = d.parts;
	assert.equal(tier?.level, 2);
	assert.equal(work?.level, 1);
	assert.equal(d.model, "jev-1.14.0");
	assert.equal(seen.length, 1);
	assert.match(
		seen[0]?.url ?? "",
		/^https:\/\/api\.typesafe\.ai\/v1\/systemone/,
	);
	assert.ok(!seen[0]?.body.includes("abc.def.ghi"), "the brief is redacted");
	assert.ok(seen[0]?.signal instanceof AbortSignal);
});

test("the printed head of a case is redacted like the request", () => {
	const head = caseHead("Bearer abc.def-123 then\nthe task");
	assert.equal(head, "Bearer *** then the task");
});
