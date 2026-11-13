import type { Level } from "./part.ts";

type RoutedLine = {
	readonly level: Level;
	readonly target: string;
	// A harness that sets no effort leaves the segment out.
	readonly effort?: string;
	readonly probabilities: string;
	readonly suffix: string;
};

export const LINE_PREFIX = "model-router ";
export const ENTRY_SEPARATOR = " | ";

// A level pinned by the caller has no probabilities, so its line stops after the target.
export const pinnedLine = (level: Level, target: string): string =>
	`L${level} ${target}`;

/**
 * Returns the routing line: the level, the target, the effort when given, the
 * probabilities and the suffix. Never throws.
 */
export function routedLine({
	level,
	target,
	effort,
	probabilities,
	suffix,
}: RoutedLine): string {
	const effortSegment = effort === undefined ? "" : ` · ${effort}`;
	return `${pinnedLine(level, target)}${effortSegment} · p=${probabilities}${suffix}`;
}

const SKIPPED_PREFIX = "skipped, ";
export const skippedLine = (reason: string): string =>
	`${SKIPPED_PREFIX}${reason}`;
