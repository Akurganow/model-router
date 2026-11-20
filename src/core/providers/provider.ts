export const PROVIDER_VALUES = [
	"auto",
	"openrouter-first",
	"typesafe",
	"openrouter",
] as const;
export type ProviderValue = (typeof PROVIDER_VALUES)[number];
// The one list of providers; every table keyed by provider follows it.
export const PROVIDERS = ["typesafe", "openrouter"] as const;
export type Provider = (typeof PROVIDERS)[number];

// Every harness reads a provider's key from the same variable.
export const KEY_VARIABLES: Readonly<Record<Provider, string>> = {
	typesafe: "TYPESAFE_API_KEY",
	openrouter: "OPENROUTER_API_KEY",
};

// The setting name that holds each provider's key, in the harnesses that name one.
export const KEY_FIELDS = {
	typesafe: "api_key",
	openrouter: "openrouter_api_key",
} as const satisfies Readonly<Record<Provider, string>>;

// The key each provider has, as the harness read it.
export type Keys = Partial<Record<Provider, string>>;

export const FIRST_ATTEMPT_TIMEOUT_MS = 2000;
// Each provider's row is the model its endpoint understands. Both resolve this alias to their
// newest Jev release.
const MODELS: Readonly<Record<Provider, string>> = {
	typesafe: "jev-latest",
	openrouter: "jev-latest",
};
const DEFAULT_VALUE: ProviderValue = "typesafe";

const ORDER: Readonly<Record<ProviderValue, readonly Provider[]>> = {
	auto: PROVIDERS,
	"openrouter-first": ["openrouter", "typesafe"],
	typesafe: ["typesafe"],
	openrouter: ["openrouter"],
};

export type Attempt = {
	readonly provider: Provider;
	readonly model: string;
	// Reaches only the request's auth header; never print it.
	readonly key: string;
	readonly timeout?: number;
	readonly retries?: number;
};

/**
 * Returns the value as a provider value when it is a known name, and undefined
 * for anything else, including non-text and inherited property names. Never
 * throws.
 */
export const parseProvider = (value: unknown): ProviderValue | undefined =>
	typeof value === "string" && Object.hasOwn(ORDER, value)
		? (value as ProviderValue)
		: undefined;

/**
 * Returns the value when it is a known provider value, and the default typesafe
 * otherwise. Never throws.
 */
export const resolve = (value: unknown): ProviderValue =>
	parseProvider(value) ?? DEFAULT_VALUE;

export const order = (value: unknown): readonly Provider[] =>
	ORDER[resolve(value)];

/**
 * Returns the keys that lookup finds for the providers the value allows. A
 * provider the value leaves out is never looked up, and one whose lookup gives
 * undefined has no entry. Each lookup finishes before the next starts, and a
 * rejection stops the rest and passes through.
 */
export async function collectKeys(
	value: unknown,
	lookup: (provider: Provider) => Promise<string | undefined>,
): Promise<Keys> {
	const keys: Keys = {};
	for (const provider of order(value)) {
		const key = await lookup(provider);
		if (key !== undefined) keys[provider] = key;
	}
	return keys;
}

/** The same rule as collectKeys, for a lookup that answers at once. */
export function collectKeysSync(
	value: unknown,
	lookup: (provider: Provider) => string | undefined,
): Keys {
	const keys: Keys = {};
	for (const provider of order(value)) {
		const key = lookup(provider);
		if (key !== undefined) keys[provider] = key;
	}
	return keys;
}

/**
 * Returns one attempt for each provider the value allows whose key is a
 * non-empty string, carrying that key. Every attempt but the last gives up
 * fast, so the next one gets most of the routing limit. Returns no attempts
 * when no key is set. Never throws.
 */
export function plan(value: unknown, keys: Readonly<Keys>): Attempt[] {
	const attempts: Attempt[] = [];
	for (const provider of order(value)) {
		const key = keys[provider];
		if (key) attempts.push({ provider, model: MODELS[provider], key });
	}
	return attempts.map((attempt, i) =>
		i < attempts.length - 1
			? { ...attempt, timeout: FIRST_ATTEMPT_TIMEOUT_MS, retries: 0 }
			: attempt,
	);
}
