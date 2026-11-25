/**
 * Returns the trimmed text, or undefined when the value is blank after trimming
 * or is not text. Never throws.
 */
export const nonEmpty = (value: unknown): string | undefined => {
	const text = typeof value === "string" ? value.trim() : "";
	return text === "" ? undefined : text;
};

/** Returns a value as a person would read it: a text as written, anything else as JSON. Never throws. */
export const textOf = (value: unknown): string => {
	if (typeof value === "string") return value;
	try {
		return JSON.stringify(value) ?? String(value);
	} catch {
		return String(value);
	}
};
