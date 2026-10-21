import assert from "node:assert/strict";
import { test } from "node:test";
import { decisionSuffix } from "./core.ts";

const reply = (fields: Record<string, unknown>) => JSON.stringify(fields);
const usage = { input_tokens: 812, output_tokens: 9 };

test("a model and both counts give the contract example", () => {
	const suffix = decisionSuffix(reply({ model: "jev-1.14.0", usage }));
	assert.equal(
		`L1 sonnet · medium · p=0.80/0.60${suffix}`,
		"L1 sonnet · medium · p=0.80/0.60 · jev jev-1.14.0 · 812/9 tok",
	);
});

test("a response without a model leaves out the model part", () => {
	assert.equal(decisionSuffix(reply({ usage })), " · 812/9 tok");
});

test("a response without usage leaves out the token part", () => {
	assert.equal(
		decisionSuffix(reply({ model: "jev-1.14.0" })),
		" · jev jev-1.14.0",
	);
});

test("the token part needs both counts", () => {
	for (const partial of [
		{ input_tokens: 812 },
		{ output_tokens: 9 },
		{ input_tokens: 812, output_tokens: "9" },
		{ input_tokens: -1, output_tokens: 9 },
		{ input_tokens: 1.5, output_tokens: 9 },
		{},
		null,
	])
		assert.equal(
			decisionSuffix(reply({ model: "m", usage: partial })),
			" · jev m",
		);
});

test("zero counts are counts", () => {
	const zero = { input_tokens: 0, output_tokens: 0 };
	assert.equal(decisionSuffix(reply({ usage: zero })), " · 0/0 tok");
});

test("the model keeps only letters, digits, dot, dash and underscore", () => {
	assert.equal(
		decisionSuffix(reply({ model: "jev 1.14\n· <b>x</b>_y-z" })),
		" · jev jev1.14bxb_y-z",
	);
});

test("the model is cut to 40 characters", () => {
	const suffix = decisionSuffix(reply({ model: "a".repeat(100) }));
	assert.equal(suffix, ` · jev ${"a".repeat(40)}`);
});

test("a model with nothing left after cleaning is left out", () => {
	assert.equal(decisionSuffix(reply({ model: "  \n" })), "");
	assert.equal(decisionSuffix(reply({ model: 7 })), "");
});

test("text that is not a JSON object gives no suffix", () => {
	for (const text of ["not json", "null", "[]", '"jev"', ""])
		assert.equal(decisionSuffix(text), "");
});
