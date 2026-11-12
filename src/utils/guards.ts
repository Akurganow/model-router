import { nonEmpty } from "./text.ts";

export const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === "object" && v !== null;

/**
 * Tells whether a value is present: text counts only when it is not blank, and
 * any other value counts unless it is null or undefined.
 */
export const isSet = (v: unknown): boolean =>
	typeof v === "string"
		? nonEmpty(v) !== undefined
		: v !== undefined && v !== null;
