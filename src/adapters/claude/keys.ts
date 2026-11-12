import {
	KEY_FIELDS,
	type Keys,
	order,
	type Provider,
} from "../../core/provider.ts";
import { nonEmpty } from "../../utils/text.ts";
import type { Engine, Options } from "./host.ts";

/**
 * Returns the trimmed keys of the providers the value allows. Each key goes
 * only to its own provider, and the key of a provider the value leaves out is
 * never read. The sensitive option comes first. The desktop app reads it back
 * empty after a restart, so the variable stands in. A provider with no
 * non-blank key has no entry. A rejected variable lookup passes through.
 */
export async function readKeys(
	$: Engine,
	options: Options,
	provider: unknown,
): Promise<Keys> {
	const keys: Keys = {};
	for (const name of order(provider)) {
		const key =
			nonEmpty(options[KEY_FIELDS[name]]) ??
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
