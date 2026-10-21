import assert from "node:assert/strict";
import { test } from "node:test";
import { BUDGET_CHARS, OMISSION_MARKER, prepareBrief } from "./core.ts";

// BUDGET_CHARS 12000, marker 31 characters: head floor(2/3 * 11969), tail the rest.
const HEAD_CHARS = 7979;
const TAIL_CHARS = 3990;

test("a short text comes back unchanged", () => {
	const text = "Create src/hello.ts and run the tests.";
	assert.equal(prepareBrief(text), text);
});

test("a text of exactly the budget comes back unchanged", () => {
	const text = "x".repeat(BUDGET_CHARS);
	assert.equal(prepareBrief(text), text);
});

test("a text one character over the budget is cut to exactly the budget", () => {
	const out = prepareBrief("x".repeat(BUDGET_CHARS + 1));
	assert.equal(out.length, BUDGET_CHARS);
	assert.ok(out.includes(OMISSION_MARKER));
});

test("the marker is fixed and counts toward the budget", () => {
	assert.equal(OMISSION_MARKER, "\n[middle of the brief omitted]\n");
	assert.equal(OMISSION_MARKER.length, 31);
});

test("the head gets two thirds of the remaining characters and the tail the rest", () => {
	const text = `${"h".repeat(BUDGET_CHARS)}${"t".repeat(BUDGET_CHARS)}`;
	const out = prepareBrief(text);
	const [head, tail] = out.split(OMISSION_MARKER);
	assert.equal(head, "h".repeat(HEAD_CHARS));
	assert.equal(tail, "t".repeat(TAIL_CHARS));
	assert.equal(out.length, BUDGET_CHARS);
});

test("the head and the tail are the ends of the text", () => {
	const middle = "m".repeat(BUDGET_CHARS);
	const out = prepareBrief(`START${middle}END`);
	assert.ok(out.startsWith("START"));
	assert.ok(out.endsWith("END"));
});

test("code blocks and blank lines shrink before the cut, so a short result is not cut", () => {
	const code = `\`\`\`ts\n${"const a = 1\n".repeat(BUDGET_CHARS)}\`\`\``;
	const out = prepareBrief(`a\n\n\n\nb ${code} c`);
	assert.equal(
		out,
		`a\n\nb [an exact block of ${BUDGET_CHARS} lines is given verbatim] c`,
	);
});

// The secret moves across the cut one character at a time, so every split of it is tried.
const SECRETS = ["API_KEY=Zq9fK2mTvv", "sk-Zq9fK2mTvvQ8"];
const SECRET_PIECES = /Zq|Tvv/;
const SWEEP = 20;

test("a secret that straddles the head cut never appears", () => {
	for (const secret of SECRETS)
		for (let shift = 0; shift < SWEEP; shift++) {
			const text = `${"x".repeat(HEAD_CHARS - shift)} ${secret} ${"y".repeat(BUDGET_CHARS)}`;
			assert.doesNotMatch(prepareBrief(text), SECRET_PIECES);
		}
});

test("a secret that straddles the tail cut never appears", () => {
	for (const secret of SECRETS)
		for (let shift = 0; shift < SWEEP; shift++) {
			const text = `${"y".repeat(BUDGET_CHARS)} ${secret} ${"x".repeat(TAIL_CHARS - shift)}`;
			assert.doesNotMatch(prepareBrief(text), SECRET_PIECES);
		}
});

test("a secret inside a code block is redacted before the block collapses", () => {
	const out = prepareBrief("```\nAPI_KEY=Zq9fK2mTvv\n```");
	assert.doesNotMatch(out, /Zq/);
});

const SMALL_BUDGET = 600;
const SMALL_HEAD_CHARS = 379;
const SMALL_TAIL_CHARS = 190;

test("a smaller budget cuts to exactly that length with the marker counted", () => {
	const text = `${"h".repeat(BUDGET_CHARS)}${"t".repeat(BUDGET_CHARS)}`;
	const out = prepareBrief(text, SMALL_BUDGET);
	const [head, tail] = out.split(OMISSION_MARKER);
	assert.equal(out.length, SMALL_BUDGET);
	assert.equal(head, "h".repeat(SMALL_HEAD_CHARS));
	assert.equal(tail, "t".repeat(SMALL_TAIL_CHARS));
});

test("a text within a smaller budget comes back unchanged", () => {
	const text = "x".repeat(SMALL_BUDGET);
	assert.equal(prepareBrief(text, SMALL_BUDGET), text);
});

test("a smaller budget still redacts before it cuts", () => {
	for (let shift = 0; shift < SWEEP; shift++) {
		const text = `${"x".repeat(SMALL_HEAD_CHARS - shift)} API_KEY=Zq9fK2mTvv ${"y".repeat(BUDGET_CHARS)}`;
		assert.doesNotMatch(prepareBrief(text, SMALL_BUDGET), SECRET_PIECES);
	}
});
