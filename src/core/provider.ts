import {
	APIConnectionError,
	APIError,
	APIUserAbortError,
} from "@typesafe-ai/sdk";

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

// The SDK appends /v1/systemone to the host.
export const HOSTS: Readonly<Record<Provider, string>> = {
	typesafe: "https://api.typesafe.ai",
	openrouter: "https://openrouter.ai/api",
};

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
// Both providers resolve this alias to their newest Jev release.
const MODEL = "jev-latest";
const DEFAULT_VALUE: ProviderValue = "typesafe";
const FALLBACK_STATUSES: ReadonlySet<number> = new Set([
	401, 402, 403, 404, 408, 429,
]);
const SERVER_ERRORS = { min: 500, max: 599 };

const ORDER: Readonly<Record<ProviderValue, readonly Provider[]>> = {
	auto: PROVIDERS,
	"openrouter-first": ["openrouter", "typesafe"],
	typesafe: ["typesafe"],
	openrouter: ["openrouter"],
};
const NARROWABLE: readonly ProviderValue[] = ["auto", "openrouter-first"];

export type Attempt = {
	readonly provider: Provider;
	readonly model: string;
	readonly timeout?: number;
	readonly retry?: { readonly maxRetries: number };
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
 * undefined has no entry. Throws only when lookup throws.
 */
export function collectKeys(
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
 * Like collectKeys for a lookup that returns a promise. Each lookup finishes
 * before the next starts, and a rejection stops the rest and passes through.
 */
export async function collectKeysAsync(
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

/**
 * Returns one attempt for each provider the value allows whose entry in keys is
 * set: a key, or true for a caller that holds none. Every attempt but the last
 * gives up fast, so the next one gets most of the routing limit. Returns no
 * attempts when no entry is set. Never throws.
 */
export function plan(
	value: unknown,
	keys: Readonly<Partial<Record<Provider, unknown>>>,
): Attempt[] {
	const providers = order(value).filter((p) => Boolean(keys[p]));
	return providers.map((provider, i) =>
		i < providers.length - 1
			? {
					provider,
					model: MODEL,
					timeout: FIRST_ATTEMPT_TIMEOUT_MS,
					retry: { maxRetries: 0 },
				}
			: { provider, model: MODEL },
	);
}

// A cancel or the routing limit surfaces as APIUserAbortError, so neither falls back.
export function fallsBack(err: unknown): boolean {
	if (err instanceof APIUserAbortError) return false;
	if (err instanceof APIConnectionError) return true;
	if (!(err instanceof APIError)) return false;
	const { status } = err;
	return (
		FALLBACK_STATUSES.has(status) ||
		(status >= SERVER_ERRORS.min && status <= SERVER_ERRORS.max)
	);
}

// A project may only drop one provider from a two-provider global value, never swap, add or reorder.
export function narrow(global: unknown, project: unknown): ProviderValue {
	const value = resolve(global);
	return NARROWABLE.includes(value) &&
		(project === "typesafe" || project === "openrouter")
		? project
		: value;
}
