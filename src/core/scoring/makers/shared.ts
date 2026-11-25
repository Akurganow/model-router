import type { Path } from "#core/providers/provider.ts";
import type { Format } from "#core/scoring/formats/format.ts";

export type KeyHeader = { readonly name: string; readonly prefix: string };
export type Endpoint = {
	readonly url: string;
	readonly format: Format;
	// The model name this endpoint takes.
	readonly model: string;
	readonly keyHeader: KeyHeader;
};

// A provider's module: one endpoint for each path. `paths` leaves room for later fields of the module, such as its OpenRouter vendor.
export type MakerModule = { readonly paths: Readonly<Record<Path, Endpoint>> };

export const BEARER: KeyHeader = { name: "Authorization", prefix: "Bearer " };
// The OpenAI and Google OpenRouter paths ask this one address.
export const OPENROUTER_DECISIONS_URL =
	"https://openrouter.ai/api/alpha/decisions";
