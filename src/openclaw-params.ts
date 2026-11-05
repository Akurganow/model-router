import { nonEmpty } from "./part.ts";

type Params = Readonly<Record<string, unknown>>;

// OpenClaw's `toSnakeCaseKey` in src/param-key.ts.
const snakeCase = (key: string): string =>
	key
		.replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
		.replace(/([a-z0-9])([A-Z])/g, "$1_$2")
		.toLowerCase();

/**
 * OpenClaw's `readSnakeCaseParamRaw`: the own key, else its snake-case form.
 * An own key wins even when its value is empty or not text.
 */
export function readParam(params: Params, key: string): unknown {
	if (Object.hasOwn(params, key)) return params[key];
	const snake = snakeCase(key);
	return Object.hasOwn(params, snake) ? params[snake] : undefined;
}

/** OpenClaw's `readToolStringParam`: text only, trimmed, and empty counts as absent. */
export const readStringParam = (
	params: Params,
	key: string,
): string | undefined => nonEmpty(readParam(params, key));
