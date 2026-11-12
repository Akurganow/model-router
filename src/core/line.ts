import type { Level } from "./part.ts";

type RoutedLine = {
	readonly level: Level;
	// A level that changes nothing has no target.
	readonly target: string | undefined;
	// A harness that sets no effort leaves the segment out.
	readonly effort?: string;
	readonly probabilities: string;
	readonly suffix: string;
};

export const LINE_PREFIX = "model-router ";
export const NO_CHANGE = "no change";
export const ENTRY_SEPARATOR = " | ";

/**
 * Returns the routing line: the level, the target or "no change", the effort
 * when given, the probabilities and the suffix. Never throws.
 */
export function routedLine({
	level,
	target,
	effort,
	probabilities,
	suffix,
}: RoutedLine): string {
	const effortSegment = effort === undefined ? "" : ` · ${effort}`;
	return `L${level} ${target ?? NO_CHANGE}${effortSegment} · p=${probabilities}${suffix}`;
}

const SKIPPED_PREFIX = "skipped, ";
export const skippedLine = (reason: string): string =>
	`${SKIPPED_PREFIX}${reason}`;
