// Hermes still stores one setting, `provider`, with four values that fold the provider and the gateway
// into one text, and its Python reads constants.json in that shape. This file holds that shape until
// Hermes gets the `gateway` setting. The change that gives it the setting deletes this file.
import {
	type Choice,
	type Gateway,
	holders,
} from "#core/providers/provider.ts";

// The gateway each stored value means, in the order Hermes lists the values.
const GATEWAY_OF = {
	auto: "auto",
	"openrouter-first": "openrouter-first",
	typesafe: "direct",
	openrouter: "openrouter",
} as const satisfies Readonly<Record<string, Gateway>>;

export type StoredProvider = keyof typeof GATEWAY_OF;

export const STORED_VALUES = Object.keys(GATEWAY_OF) as StoredProvider[];
export const STORED_DEFAULT: StoredProvider = "typesafe";

/**
 * Returns the choice a stored value stands for. Anything that is not one of the
 * four values, including non-text and inherited property names, reads as the
 * default. Never throws.
 */
export const choiceOf = (value: unknown): Choice => ({
	provider: "typesafe",
	gateway:
		typeof value === "string" && Object.hasOwn(GATEWAY_OF, value)
			? GATEWAY_OF[value as StoredProvider]
			: GATEWAY_OF[STORED_DEFAULT],
});

// The provider line prints the stored value as it is, with the key holders it asks.
export const providerLine = (value: StoredProvider): string =>
	`provider: ${value} (${holders(choiceOf(value)).join(", then ")})`;

export const PROVIDER_USE_ONE_OF = `provider: use one of ${STORED_VALUES.join(", ")}`;

export const PROVIDER_COMMAND_DESCRIPTION = `Shows or changes which providers score subagent calls: ${STORED_VALUES.join(", ")}.`;
