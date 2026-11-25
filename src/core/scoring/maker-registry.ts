import type { Attempt, Maker } from "#core/providers/provider.ts";
import type { Endpoint, MakerModule } from "./maker-module.ts";
import { google } from "./makers/google.ts";
import { openai } from "./makers/openai.ts";
import { typesafe } from "./makers/typesafe.ts";

// A maker in `MAKERS` with no module, or a module with no maker, fails the type check.
const MODULES: Readonly<Record<Maker, MakerModule>> = {
	typesafe,
	openai,
	google,
};

/**
 * Returns the endpoint of the attempt's maker and path, and undefined for a maker or a path the
 * modules do not hold, an inherited name such as toString included.
 */
export function endpointOf(attempt: Attempt): Endpoint | undefined {
	if (!Object.hasOwn(MODULES, attempt.maker)) return undefined;
	const { paths } = MODULES[attempt.maker];
	return Object.hasOwn(paths, attempt.path) ? paths[attempt.path] : undefined;
}
