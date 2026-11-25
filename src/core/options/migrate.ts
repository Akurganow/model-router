import { withModel } from "./models.ts";

// Names the newest step, for the changelog and OpenClaw's migration id. No version is stored:
// each step recognises its input from the data.
export const SETTINGS_VERSION = 1;

export type StoredRecord = Readonly<Record<string, unknown>>;
type Step = (
	stored: StoredRecord,
) => { stored: StoredRecord; change: string } | undefined;

// Claude Code's removed option `model` names the TypeSafe model: it becomes the `typesafe` entry of
// `models` unless `models` names one already or is not valid, or the entry would not read back as
// written. `models` keeps its form. `model` itself stays.
const typesafeFromModel: Step = (stored) => {
	const { model, models } = stored;
	if (typeof model !== "string") return undefined;
	const added = withModel(models, "typesafe", model.trim());
	if (added === undefined || model.trim() === "") return undefined;
	return {
		stored: { ...stored, models: added },
		change: "models: typesafe from the removed model option",
	};
};

// Oldest step first.
const STEPS: readonly Step[] = [typesafeFromModel];

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
