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

// A provider's module: one endpoint for each path, and what the registry needs to translate a model name
// the user stored into the name each path takes.
export type MakerModule = {
	readonly paths: Readonly<Record<Path, Endpoint>>;
	// The company that OpenRouter names in this maker's slugs.
	readonly vendor: string;
	// How OpenRouter's route for this maker takes a name outside `openrouterNames`: "system-one" takes
	// it as written, because that route maps bare names itself; "decisions" takes it as `vendor/name`.
	readonly openrouterRoute: "system-one" | "decisions";
	// The OpenRouter slug of each known name.
	readonly openrouterNames: Readonly<Record<string, string>>;
};

export const BEARER: KeyHeader = { name: "Authorization", prefix: "Bearer " };
