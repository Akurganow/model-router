import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { FITTED_ON, fitWarning } from "./jev-fit.ts";

test("the fitted version is the one model-choice.md names in the fit sentence", () => {
	const doc = readFileSync(
		new URL("../plugins/model-router/docs/model-choice.md", import.meta.url),
		"utf8",
	).replace(/\s+/g, " ");
	assert.ok(
		doc.includes(
			`One \`scripts/calibrate.ts --record\` run on \`${FITTED_ON}\` wrote the probabilities`,
		),
		`model-choice.md does not say the factors were fitted on ${FITTED_ON}`,
	);
});

test("the warning names the fitted version, the answering model and the refit", () => {
	assert.equal(
		fitWarning("jev-1.15.0"),
		`warning: Jev answered as jev-1.15.0, and the factors were fitted on ${FITTED_ON}. Refit them with scripts/calibrate.ts --record before you trust the decisions.`,
	);
});
