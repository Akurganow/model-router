/** Returns the message of an Error, or the string form of any other thrown value. */
export const errorText = (err: unknown): string =>
	err instanceof Error ? err.message : String(err);
