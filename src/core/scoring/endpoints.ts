import type { Attempt, Provider } from "../providers/provider.ts";
import type { Format } from "./formats/format.ts";
import { SYSTEM_ONE } from "./formats/system-one.ts";

export type Endpoint = {
	readonly url: string;
	readonly format: Format;
};

// The one place that knows where each provider is asked and in what format.
export const ENDPOINTS: Readonly<Record<Provider, Endpoint>> = {
	typesafe: {
		url: "https://api.typesafe.ai/v1/systemone",
		format: SYSTEM_ONE,
	},
	openrouter: {
		url: "https://openrouter.ai/api/v1/systemone",
		format: SYSTEM_ONE,
	},
};

/**
 * Returns the endpoint of the attempt's provider, and undefined for a name the
 * table does not hold, an inherited name such as toString included.
 */
export const endpointOf = (attempt: Attempt): Endpoint | undefined =>
	Object.hasOwn(ENDPOINTS, attempt.provider)
		? ENDPOINTS[attempt.provider]
		: undefined;
