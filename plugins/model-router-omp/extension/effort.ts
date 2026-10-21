import type { ModelLike } from "./types.ts";

export type TaskEffort = "lo" | "med" | "hi";
export type Choice = { effort: TaskEffort; shown: string };

// omp's canonical order (packages/catalog/src/effort.ts at v18.2.8).
const LEVELS = ["minimal", "low", "medium", "high", "xhigh", "max"];
const rank = (level: string) => LEVELS.indexOf(level);

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
	const supported = model?.reasoning ? (model.thinking?.efforts ?? []) : [];
	const requested = pick(effort, supported);
	if (requested === undefined) return { effort, shown: effort };
	const ceiling =
		maxEffort === undefined
			? requested
			: supported.findLast((level) => rank(level) <= rank(maxEffort));
	if (ceiling === undefined) return undefined;
	const applied = rank(requested) > rank(ceiling) ? ceiling : requested;
	return { effort, shown: `${effort}→${applied}` };
}
