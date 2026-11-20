import type { Level } from "../parts/part.ts";
import { failedAttemptText, type PlainFailedAttempt } from "./reasons.ts";

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

const PROBABILITY_DIGITS = 2;

export const formatProbability = (p: number): string =>
	p.toFixed(PROBABILITY_DIGITS);

const isCount = (v: unknown): v is number =>
	typeof v === "number" && Number.isSafeInteger(v) && v >= 0;

type DecisionSuffix = {
	readonly provider: string;
	readonly model: string;
	readonly inputTokens?: number | null | undefined;
	readonly outputTokens?: number | null | undefined;
	readonly failed?: PlainFailedAttempt | undefined;
};

// The provider always shows. A model or usage the reply lacks is left out, never guessed.
export function decisionSuffix({
	provider,
	model,
	inputTokens,
	outputTokens,
	failed,
}: DecisionSuffix): string {
	return (
		` · ${provider}` +
		(model ? ` ${model}` : "") +
		(isCount(inputTokens) && isCount(outputTokens)
			? ` · ${inputTokens}/${outputTokens} tok`
			: "") +
		(failed ? ` · ${failedAttemptText(failed)}` : "")
	);
}
