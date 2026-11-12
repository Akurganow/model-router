import { nonEmpty } from "./text.ts";

export const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === "object" && v !== null;

/** Tells whether a value is a finite number above 0. Number objects are not. */
export const isPositiveNumber = (v: unknown): v is number =>
	typeof v === "number" && Number.isFinite(v) && v > 0;

/**
 * Tells whether a value is present: text counts only when it is not blank, and
 * any other value counts unless it is null or undefined.
 */
export const isSet = (v: unknown): boolean =>
	typeof v === "string"
		? nonEmpty(v) !== undefined
		: v !== undefined && v !== null;
