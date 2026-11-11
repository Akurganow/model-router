// The plugins ask for jev-latest, so the server may move the alias to a model the factors were never fitted on.
// plugins/model-router/docs/model-choice.md#how-the-factors-were-measured records the fit; jev-fit.test.ts keeps the two equal.
export const FITTED_ON = "jev-1.14.0";

/** Returns the warning for a run that Jev answered as `model`. Never throws. */
export const fitWarning = (model: string): string =>
	`warning: Jev answered as ${model}, and the factors were fitted on ${FITTED_ON}. Refit them with scripts/calibrate.ts --record before you trust the decisions.`;

/** Returns one warning per answering model other than FITTED_ON, in first-seen order. Ignores empty names. */
export const fitWarnings = (models: Iterable<string>): string[] =>
	[...new Set(models)]
		.filter((m) => m !== "" && m !== FITTED_ON)
		.map(fitWarning);
