/**
 * Returns the trimmed text, or undefined when the value is blank after trimming
 * or is not text. Never throws.
 */
export const nonEmpty = (value: unknown): string | undefined => {
	const text = typeof value === "string" ? value.trim() : "";
	return text === "" ? undefined : text;
};
