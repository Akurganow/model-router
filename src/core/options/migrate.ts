// The migration ladder: each step turns a stored setting a past version wrote into the form the
// current one reads.
//
// Adding a step:
// - Append it to STEPS. SETTINGS_VERSION follows the length.
// - Every harness passes the keys the step reads into `settingsOf`. Add each new key to that
//   harness's list of stored keys: Claude Code's `storedOf` and `Options`, omp's `readSettings`,
//   OpenClaw's `readSettings`, Hermes's request reader. A key missing there never reaches the step.
// - OpenClaw also runs the ladder over its stored config through its own migration entry. Give that
//   entry the new step.
// - A step that reads `models` handles its three shapes: the owner's short text
//   `{typesafe:jev-preview}`, a JSON text, and a native object. `withModel` keeps each shape.
// - A step changes nothing on its own output, so a second run gives the same record.

import { nonEmpty } from "#utils/text.ts";
import { withModel } from "./models.ts";

export type StoredRecord = Readonly<Record<string, unknown>>;
type Step = (
	stored: StoredRecord,
) => { stored: StoredRecord; change: string } | undefined;

// Claude Code's removed option `model` names the TypeSafe model: it becomes the `typesafe` entry of
// `models` unless `models` names one already or is not valid, or the entry would not read back as
// written. `models` keeps its form. `model` itself stays.
const typesafeFromModel: Step = (stored) => {
	const { model, models } = stored;
	const name = nonEmpty(model);
	if (name === undefined) return undefined;
	const added = withModel(models, "typesafe", name);
	if (added === undefined) return undefined;
	return {
		stored: { ...stored, models: added },
		change: "models: typesafe from the removed model option",
	};
};

// Oldest step first.
const STEPS: readonly Step[] = [typesafeFromModel];

// Names the newest step, for the changelog and OpenClaw's migration id. No version is stored:
// each step recognises its input from the data.
export const SETTINGS_VERSION = STEPS.length;

/**
 * Returns the stored settings after every step of the ladder, and the text of each change made.
 * A step changes nothing on its own output, so a second run gives the same record.
 */
export function migrate(stored: StoredRecord): {
	readonly stored: StoredRecord;
	readonly changes: readonly string[];
} {
	let current = stored;
	const changes: string[] = [];
	for (const step of STEPS) {
		const done = step(current);
		if (done === undefined) continue;
		current = done.stored;
		changes.push(done.change);
	}
	return { stored: current, changes };
}
