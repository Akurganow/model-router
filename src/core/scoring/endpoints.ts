import type { Attempt, Maker, Path } from "#core/providers/provider.ts";
import type { Format } from "./formats/format.ts";
import { SYSTEM_ONE } from "./formats/system-one.ts";

type KeyHeader = { readonly name: string; readonly prefix: string };
type Endpoint = {
	readonly url: string;
	readonly format: Format;
	// The model name this endpoint takes.
	readonly model: string;
	readonly keyHeader: KeyHeader;
};

const BEARER: KeyHeader = { name: "Authorization", prefix: "Bearer " };
// Both endpoints resolve this alias to their newest Jev release.
const JEV = "jev-latest";

// The one place that knows where each maker is asked on each path, in what format, under which
// model name and in which header its key goes. A maker or a path with no row fails the type check.
export const ENDPOINTS: Readonly<
	Record<Maker, Readonly<Record<Path, Endpoint>>>
> = {
	typesafe: {
		direct: {
			url: "https://api.typesafe.ai/v1/systemone",
			format: SYSTEM_ONE,
			model: JEV,
			keyHeader: BEARER,
		},
		openrouter: {
			url: "https://openrouter.ai/api/v1/systemone",
			format: SYSTEM_ONE,
			model: JEV,
			keyHeader: BEARER,
		},
	},
};

/**
 * Returns the endpoint of the attempt's maker and path, and undefined for a maker or a path the
 * table does not hold, an inherited name such as toString included.
 */
export function endpointOf(attempt: Attempt): Endpoint | undefined {
	if (!Object.hasOwn(ENDPOINTS, attempt.maker)) return undefined;
	const rows = ENDPOINTS[attempt.maker];
	return Object.hasOwn(rows, attempt.path) ? rows[attempt.path] : undefined;
}
