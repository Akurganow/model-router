import type { ModelLike } from "./types.ts";

export type TaskEffort = "lo" | "med" | "hi";
export type Choice = { effort: TaskEffort; shown: string; applied?: string };

// omp's canonical order (packages/catalog/src/effort.ts at v18.2.8).
const LEVELS = ["minimal", "low", "medium", "high", "xhigh", "max"];
const rank = (level: string) => LEVELS.indexOf(level);

const levelsOf = (model: ModelLike | undefined): readonly string[] =>
	model?.reasoning ? (model.thinking?.efforts ?? []) : [];

const pick = (effort: TaskEffort, supported: readonly string[]) => {
	if (effort === "lo") return supported[0];
	if (effort === "hi") return supported.at(-1);
	return supported[(supported.length - 1) >> 1];
};

// Mirrors omp's resolveTaskEffortLevel (packages/tui/src/thinking.ts at v18.2.8). omp fails the spawn
// when the cap sits below the model's lowest level, so that case returns no effort at all.
export function chooseEffort(
	effort: TaskEffort,
	model: ModelLike | undefined,
	maxEffort?: string,
): Choice | undefined {
	const supported = levelsOf(model);
	const requested = pick(effort, supported);
	if (requested === undefined) return { effort, shown: effort };
	const ceiling =
		maxEffort === undefined
			? requested
			: supported.findLast((level) => rank(level) <= rank(maxEffort));
	if (ceiling === undefined) return undefined;
	const applied = rank(requested) > rank(ceiling) ? ceiling : requested;
	return { effort, shown: `${effort}→${applied}`, applied };
}

// The light tier never runs at the model's lowest level, so a request that lands there moves up to hi.
// When the user's cap pins hi there too, the request stays as it was.
export function chooseLightEffort(
	effort: TaskEffort,
	model: ModelLike | undefined,
	maxEffort?: string,
): Choice | undefined {
	const choice = chooseEffort(effort, model, maxEffort);
	const lowest = levelsOf(model)[0];
	if (choice?.applied === undefined || choice.applied !== lowest) return choice;
	const higher = chooseEffort("hi", model, maxEffort);
	return higher?.applied !== undefined && higher.applied !== lowest
		? higher
		: choice;
}
