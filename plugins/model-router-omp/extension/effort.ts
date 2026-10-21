import type { ModelLike } from "./types.ts";

export type TaskEffort = "lo" | "med" | "hi";
export type Choice = { effort: TaskEffort; shown: string; applied?: string };

const levelsOf = (model: ModelLike | undefined): readonly string[] =>
	model?.reasoning ? (model.thinking?.efforts ?? []) : [];

const pick = (effort: TaskEffort, supported: readonly string[]) => {
	if (effort === "lo") return supported[0];
	if (effort === "hi") return supported.at(-1);
	return supported[(supported.length - 1) >> 1];
};

// Mirrors how omp maps a coarse effort onto the model's levels (docs/task-agent-discovery.md): lowest,
// middle (the lower of two) or highest. task.maxEffort may lower it further; the extension cannot see it.
export function chooseEffort(
	effort: TaskEffort,
	model: ModelLike | undefined,
): Choice {
	const applied = pick(effort, levelsOf(model));
	if (applied === undefined) return { effort, shown: effort };
	return { effort, shown: `${effort}→${applied}`, applied };
}

// The light tier never runs at the model's lowest level, so a request that lands there moves up to hi.
export function chooseLightEffort(
	effort: TaskEffort,
	model: ModelLike | undefined,
): Choice {
	const choice = chooseEffort(effort, model);
	const lowest = levelsOf(model)[0];
	if (choice.applied === undefined || choice.applied !== lowest) return choice;
	const higher = chooseEffort("hi", model);
	return higher.applied !== lowest ? higher : choice;
}
