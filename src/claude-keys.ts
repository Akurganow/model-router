import type { Engine, Options } from "./claude-host.ts";
import { order, type Provider } from "./provider.ts";

export type Keys = Partial<Record<Provider, string>>;

// The sensitive option comes first. The desktop app reads it back empty after a restart, so the variable stands in.
export const KEY_OPTIONS: Readonly<Record<Provider, keyof Options>> = {
	typesafe: "api_key",
	openrouter: "openrouter_api_key",
};

const nonEmpty = (v: unknown): string | undefined =>
	typeof v === "string" && v !== "" ? v : undefined;

// Each key goes only to its own provider. The key of a provider the value leaves out is never read.
export async function readKeys(
	$: Engine,
	options: Options,
	provider: unknown,
): Promise<Keys> {
	const keys: Keys = {};
	for (const name of order(provider)) {
		const key =
			nonEmpty(options[KEY_OPTIONS[name]]) ??
			nonEmpty(await keyVariable($, name));
		if (key !== undefined) keys[name] = key;
	}
	return keys;
}

// plugin validate lists the variables a module reads, so each $.env.get names its variable literally.
function keyVariable($: Engine, provider: Provider): Promise<unknown> {
	return provider === "typesafe"
		? $.env.get("TYPESAFE_API_KEY")
		: $.env.get("OPENROUTER_API_KEY");
}
