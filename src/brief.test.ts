import assert from "node:assert/strict";
import { test } from "node:test";
import {
	BUDGET_CHARS,
	buildPrompt,
	contextText,
	NO_DESCRIPTION,
	OMISSION_MARKER,
	prepareBrief,
	ROLE_CAP,
	roleText,
} from "./brief.ts";

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

test("a JSON-quoted or single-quoted secret name still masks its value", () => {
	assert.equal(
		prepareBrief("{\"API_KEY\": \"abc123\"} and {'API_KEY': 'abc123'}"),
		"{\"API_KEY\": ***} and {'API_KEY': ***}",
	);
});

test("a quoted value with spaces is masked whole, closed or not", () => {
	assert.equal(
		prepareBrief('export API_KEY="abc def ghi"'),
		"export API_KEY=***",
	);
	assert.equal(prepareBrief('export API_KEY="abc def'), "export API_KEY=***");
});

test("the Bearer scheme is matched in any case", () => {
	assert.equal(prepareBrief("send with bearer abc123"), "send with Bearer ***");
});

test("assignments to names ending in key, token, secret or password are masked in any case", () => {
	const task = prepareBrief(
		'api_key=hunter22 and apiKey: "sw0rdf1sh" and password=letmein',
	);
	for (const masked of ["api_key=***", "apiKey: ***", "password=***"])
		assert.ok(task.includes(masked));
	for (const secret of ["hunter22", "sw0rdf1sh", "letmein"])
		assert.ok(!task.includes(secret));
});

// The context is capped at 3000 characters and added only when 500 fit after the task and the 17-character label.
const CONTEXT_CAP_CHARS = 3000;

test("the prompt holds the task first and the capped context after it", () => {
	const task = "Do the thing";
	const brief = buildPrompt(task, "C".repeat(10000));
	assert.ok(brief.startsWith(task));
	const tail = brief.slice(task.length);
	assert.ok(tail.includes("C"));
	assert.ok(tail.includes(OMISSION_MARKER));
	assert.ok(tail.length - tail.indexOf("C") <= CONTEXT_CAP_CHARS);
	assert.ok(brief.length <= BUDGET_CHARS);
});

test("a short context follows the task whole, behind the label", () => {
	assert.equal(
		buildPrompt("Do it", "Shared notes"),
		"Do it\n\nBatch context:\nShared notes",
	);
});

test("the prompt redacts secrets in the context", () => {
	assert.doesNotMatch(
		buildPrompt("Do it", "set API_KEY=abc123def456 first"),
		/abc123def456/,
	);
});

test("the context shrinks to the budget the task leaves", () => {
	const task = "T".repeat(11000);
	const brief = buildPrompt(task, "C".repeat(5000));
	assert.ok(brief.startsWith(task));
	assert.equal(brief.length, BUDGET_CHARS);
});

test("the context is dropped when under 500 characters remain", () => {
	const task = "T".repeat(11600);
	assert.equal(buildPrompt(task, "C".repeat(5000)), task);
});

test("the context is added when exactly 500 characters remain", () => {
	const task = "T".repeat(11483);
	assert.equal(buildPrompt(task, "C".repeat(5000)).length, BUDGET_CHARS);
});

test("the context is dropped when 499 characters remain", () => {
	const task = "T".repeat(11484);
	assert.equal(buildPrompt(task, "C".repeat(5000)), task);
});

test("the task is never shortened for the context", () => {
	const task = "T".repeat(20000);
	assert.equal(buildPrompt(task, "C".repeat(5000)), prepareBrief(task));
});

test("with no context the prompt is the task alone", () => {
	assert.equal(buildPrompt("Do it", ""), "Do it");
});

test("contextText keeps a non-blank string as it is", () => {
	assert.equal(contextText("  Shared notes\n"), "  Shared notes\n");
});

test("contextText drops a blank string and any value that is not a string", () => {
	for (const value of ["", "  \n\t ", undefined, null, 42, { text: "notes" }])
		assert.equal(contextText(value), "");
});

test("the role cap and the neutral line are fixed", () => {
	assert.equal(ROLE_CAP, 500);
	assert.equal(NO_DESCRIPTION, "An agent with no description.");
});

test("a description of exactly the cap comes back whole, one unit more is cut", () => {
	assert.equal(roleText("x".repeat(ROLE_CAP)), "x".repeat(ROLE_CAP));
	assert.equal(roleText("x".repeat(ROLE_CAP + 1)), "x".repeat(ROLE_CAP));
});

test("whitespace runs collapse to one space and the ends are trimmed", () => {
	assert.equal(
		roleText("  Reviews\n\n code \t changes  "),
		"Reviews code changes",
	);
});

test("a key beyond the cap is masked before the cut", () => {
	const key = "sk-abcdefghijklmnop";
	const out = roleText(`${"x ".repeat(240)}${key}`);
	assert.ok(!out.includes("sk-"));
	assert.ok(out.length <= ROLE_CAP);
	const split = roleText(`${"x".repeat(ROLE_CAP - 5)} ${key}`);
	assert.ok(!split.includes("sk-"));
	assert.ok(split.endsWith("***"));
});

test("a surrogate pair at the boundary is not split", () => {
	const out = roleText(`${"x".repeat(ROLE_CAP - 1)}\u{1F600}`);
	assert.equal(out, "x".repeat(ROLE_CAP - 1));
	const whole = roleText(`${"x".repeat(ROLE_CAP - 2)}\u{1F600}`);
	assert.equal(whole.length, ROLE_CAP);
	assert.ok(whole.endsWith("\u{1F600}"));
});

test("a non-string, missing or blank description gives the neutral line", () => {
	for (const input of [undefined, null, 7, {}, "", " \n\t "]) {
		assert.equal(roleText(input), NO_DESCRIPTION);
	}
});
