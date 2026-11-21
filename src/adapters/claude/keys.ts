import {
	type Choice,
	collectKeys,
	KEY_FIELDS,
	type KeyHolder,
	type Keys,
	type NoChoice,
} from "#core/providers/provider.ts";
import { nonEmpty } from "#utils/text.ts";
import type { Engine, Options } from "./host.ts";

/**
 * Returns the trimmed keys of the key holders the choice asks. Each key goes
 * only to its own key holder, and the key of one the choice leaves out is
 * never read. A NoChoice looks up nothing. The sensitive option comes first. The desktop app reads it back
 * empty after a restart, so the variable stands in. A key holder with no
 * non-blank key has no entry. A rejected variable lookup passes through.
 */
export async function readKeys(
	$: Engine,
	options: Options,
	choice: Choice | NoChoice,
): Promise<Keys> {
	return collectKeys(
		choice,
		async (holder) =>
			nonEmpty(options[KEY_FIELDS[holder]]) ??
			nonEmpty(await keyVariable($, holder)),
	);
}

// plugin validate lists the variables a module reads, so each $.env.get names its variable literally.
function keyVariable($: Engine, holder: KeyHolder): Promise<unknown> {
	switch (holder) {
		case "typesafe":
			return $.env.get("TYPESAFE_API_KEY");
		case "openai":
			return $.env.get("OPENAI_API_KEY");
		case "openrouter":
			return $.env.get("OPENROUTER_API_KEY");
	}
}
