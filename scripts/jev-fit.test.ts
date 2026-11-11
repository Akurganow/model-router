import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { FITTED_ON, fitWarning, fitWarnings } from "./jev-fit.ts";
import { OTHER_JEV } from "./jev-fit-fakes.ts";

test("the fitted version is the one model-choice.md names in the fit sentence", () => {
	const doc = readFileSync(
		new URL("../plugins/model-router/docs/model-choice.md", import.meta.url),
		"utf8",
	);
	const fit =
		/`scripts\/calibrate\.ts --record`\s+run\s+on\s+`(?<version>[^`]+)`/.exec(
			doc,
		);
	assert.equal(fit?.groups?.["version"], FITTED_ON);
});

test("the warning names the fitted version, the answering model and the refit", () => {
	assert.equal(
		fitWarning(OTHER_JEV),
		`warning: Jev answered as ${OTHER_JEV}, and the factors were fitted on ${FITTED_ON}. Refit them with scripts/calibrate.ts --record, then set FITTED_ON in scripts/jev-fit.ts to ${OTHER_JEV}.`,
	);
});

test("fitWarnings warns once per other model and skips the fitted, missing and empty ones", () => {
	assert.deepEqual(
		fitWarnings([OTHER_JEV, FITTED_ON, null, undefined, "", OTHER_JEV]),
		[fitWarning(OTHER_JEV)],
	);
});
