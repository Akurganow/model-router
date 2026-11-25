import type { Attempt, Maker, Path } from "#core/providers/provider.ts";
import type { Endpoint, MakerModule } from "./maker-module.ts";
import { google } from "./makers/google.ts";
import { openai } from "./makers/openai.ts";
import { typesafe } from "./makers/typesafe.ts";

// A maker in `MAKERS` with no module, or a module with no maker, fails the type check.
export const MODULES: Readonly<Record<Maker, MakerModule>> = {
	typesafe,
	openai,
	google,
};

/**
 * Returns the model name the maker's endpoint for the path takes, for a name the user stored. No name
 * gives the path's default. The direct path takes the name as written. The OpenRouter path takes the
 * module's slug for a known name, and for any other name what the module's route takes.
 */
export function modelOf(
	maker: Maker,
	path: Path,
	stored: string | undefined,
): string {
	const made = MODULES[maker];
	if (stored === undefined) return made.paths[path].model;
	if (path === "direct") return stored;
	if (Object.hasOwn(made.openrouterNames, stored))
		return made.openrouterNames[stored] ?? stored;
	return made.openrouterRoute === "system-one"
		? stored
		: `${made.vendor}/${stored}`;
}

/**
 * Returns the endpoint of the attempt's maker and path, with the model name the attempt's stored
 * name translates to, and undefined for a maker or a path the modules do not hold, an inherited
 * name such as toString included.
 */
export function endpointOf(attempt: Attempt): Endpoint | undefined {
	if (!Object.hasOwn(MODULES, attempt.maker)) return undefined;
	const { paths } = MODULES[attempt.maker];
	if (!Object.hasOwn(paths, attempt.path)) return undefined;
	return {
		...paths[attempt.path],
		model: modelOf(attempt.maker, attempt.path, attempt.storedModel),
	};
}
