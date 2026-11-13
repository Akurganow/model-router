import type { Effort } from "../../core/ladder.ts";
import { routedLine } from "../../core/line.ts";
import type { Level } from "../../core/part.ts";
import { CALLER_EFFORT, CONFIG_EFFORT } from "../../core/reasons.ts";
import { type Facts, ROLE_MARK } from "./items.ts";

// The middle level keeps the agent's model, so a spawn with no model patterns leaves nothing to put a level on.
const NO_PATTERNS = "no model patterns";

// The selectors omp reads as a thinking level after a pattern's last colon; a prefix must name one of them only.
// Source: docs/clients.md#omp-thinking-levels.
const SELECTORS = [
	"inherit",
	"off",
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
	"max",
] as const;
const AUTO = "auto";
const MIN_PREFIX = 2;
// The values of `task.maxEffort`, weakest first. A ceiling below `low` leaves the ladder no level.
const CEILINGS = ["minimal", "low", "medium", "high", "xhigh", "max"] as const;
const LOWEST = CEILINGS.indexOf("low");

/**
 * Returns true when omp reads the text after a pattern's last colon as a
 * thinking level: a full selector name, `auto`, or a prefix of two characters
 * or more that names one selector only. A colon that is part of a model id,
 * such as `:free` or `:8b`, names no level. Never throws.
 */
export function carriesLevel(pattern: string): boolean {
	const colon = pattern.lastIndexOf(":");
	if (colon < 0) return false;
	const suffix = pattern.slice(colon + 1);
	if (suffix === AUTO || (SELECTORS as readonly string[]).includes(suffix))
		return true;
	return (
		suffix.length >= MIN_PREFIX &&
		SELECTORS.filter((selector) => selector.startsWith(suffix)).length === 1
	);
}

// omp splits a role value on commas, as normalizeModelPatternList does.
const patternsOf = (value: unknown): string[] =>
	(typeof value === "string" ? [value] : Array.isArray(value) ? value : [])
		.filter((v): v is string => typeof v === "string")
		.flatMap((v) => v.split(","))
		.map((v) => v.trim())
		.filter((v) => v !== "");

/**
 * Returns true when the role's configured value, or a role it names with `@`,
 * carries a thinking level. A role named twice counts once. Never throws.
 */
function roleCarriesLevel(
	role: string,
	roles: Readonly<Record<string, unknown>>,
	seen = new Set<string>(),
): boolean {
	if (seen.has(role) || !Object.hasOwn(roles, role)) return false;
	seen.add(role);
	return patternsOf(roles[role]).some(
		(pattern) =>
			carriesLevel(pattern) ||
			(pattern.startsWith(ROLE_MARK) &&
				roleCarriesLevel(pattern.slice(ROLE_MARK.length), roles, seen)),
	);
}

/**
 * Returns the effort under the user's `task.maxEffort`: the effort itself when
 * the ceiling is unset or at or above it, the ceiling when it is lower, and
 * undefined when the ceiling is below `low` or not one of omp's values. Never
 * throws.
 */
export function capped(effort: Effort, ceiling: unknown): Effort | undefined {
	if (ceiling === undefined) return effort;
	const top = (CEILINGS as readonly unknown[]).indexOf(ceiling);
	if (top < LOWEST) return undefined;
	return CEILINGS.indexOf(effort) <= top ? effort : (CEILINGS[top] as Effort);
}

// A level set on the spawn, or the label of the effort the plugin leaves in place.
type EffortPlan = { readonly set: Effort } | { readonly kept: string };

// What a decision holds until its spawn. The middle level has no role.
export type Routed = {
	readonly level: Level;
	readonly role: string | undefined;
	readonly ladder: Effort;
	// Whether the item named an effort. omp applies it only while `task.enableEffort` is on, read when the plan is made.
	readonly itemEffort: boolean;
	readonly probabilities: string;
	readonly suffix: string;
};

type EffortFacts = Pick<Facts, "roles" | "maxEffort" | "effortEnabled">;

/**
 * Returns the effort to set on a spawn, or the label of the one that stays.
 * The item's own effort stays first while omp applies it, then a level on the role, then, at the
 * middle level, a level on a pattern the spawn carries, then a ceiling below
 * `low`. An end level's role replaces the patterns, so their levels do not
 * count there. The middle level with no patterns sets nothing. Patterns are
 * undefined before the spawn. Never throws.
 */
export function planEffort(
	{ role, ladder, itemEffort }: Routed,
	{ roles, maxEffort, effortEnabled }: EffortFacts,
	patterns?: readonly string[],
): EffortPlan {
	if (itemEffort && effortEnabled) return { kept: CALLER_EFFORT };
	if (
		role !== undefined &&
		roleCarriesLevel(role.slice(ROLE_MARK.length), roles)
	)
		return { kept: CONFIG_EFFORT };
	if (role === undefined && patterns?.some(carriesLevel))
		return { kept: CONFIG_EFFORT };
	const effort = capped(ladder, maxEffort);
	if (effort === undefined) return { kept: CONFIG_EFFORT };
	if (role === undefined && patterns?.length === 0)
		return { kept: NO_PATTERNS };
	return { set: effort };
}

export const lineFor = (routed: Routed, plan: EffortPlan): string =>
	routedLine({
		level: routed.level,
		target: routed.role,
		effort: "set" in plan ? plan.set : plan.kept,
		probabilities: routed.probabilities,
		suffix: routed.suffix,
	});

/**
 * Returns the model to return from the spawn hook: the role with the effort as
 * a suffix, the role alone when the effort stays, each pattern with the
 * suffix at the middle level, and undefined when the middle level sets
 * nothing. Never throws.
 */
export function modelFor(
	role: string | undefined,
	plan: EffortPlan,
	patterns: readonly string[],
): string | string[] | undefined {
	if (role !== undefined) return "set" in plan ? `${role}:${plan.set}` : role;
	return "set" in plan ? patterns.map((p) => `${p}:${plan.set}`) : undefined;
}
