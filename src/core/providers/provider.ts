export const PROVIDER_VALUES = [
	"auto",
	"openrouter-first",
	"typesafe",
	"openrouter",
] as const;
export type ProviderValue = (typeof PROVIDER_VALUES)[number];
// Whose model scores. Every table keyed by maker follows this list.
export const MAKERS = ["typesafe"] as const;
export type Maker = (typeof MAKERS)[number];
// Who holds a key: each maker for its own API, and OpenRouter for the gateway to every maker.
// An attempt shows this name in every line.
export const KEY_HOLDERS = [...MAKERS, "openrouter"] as const;
export type KeyHolder = (typeof KEY_HOLDERS)[number];
// How a maker is asked: its own API, or OpenRouter as the gateway.
export const PATHS = ["direct", "openrouter"] as const;
export type Path = (typeof PATHS)[number];
// The paths each maker has. This folder may not import scoring/, so scoring/endpoints.ts is typed
// from this table instead: a path with no endpoint row, or a row with no path here, fails the type check.
export const PATHS_OF = {
	typesafe: ["direct", "openrouter"],
} as const satisfies Readonly<Record<Maker, readonly Path[]>>;

// Every harness reads a key holder's key from the same variable.
export const KEY_VARIABLES: Readonly<Record<KeyHolder, string>> = {
	typesafe: "TYPESAFE_API_KEY",
	openrouter: "OPENROUTER_API_KEY",
};

// The setting name that holds each key holder's key, in the harnesses that name one.
export const KEY_FIELDS = {
	typesafe: "api_key",
	openrouter: "openrouter_api_key",
} as const satisfies Readonly<Record<KeyHolder, string>>;

// The key each key holder has, as the harness read it.
export type Keys = Partial<Record<KeyHolder, string>>;

export const FIRST_ATTEMPT_TIMEOUT_MS = 2000;
const DEFAULT_VALUE: ProviderValue = "typesafe";
// The one maker, until a setting names another.
const MAKER: Maker = "typesafe";

// The paths each stored value allows, in the order they are asked.
const VALUE_PATHS: Readonly<Record<ProviderValue, readonly Path[]>> = {
	auto: ["direct", "openrouter"],
	"openrouter-first": ["openrouter", "direct"],
	typesafe: ["direct"],
	openrouter: ["openrouter"],
};

export type Attempt = {
	readonly maker: Maker;
	readonly path: Path;
	// The attempt's identity in every line and fallback record: the maker on the direct path,
	// openrouter on the gateway path.
	readonly holder: KeyHolder;
	// Reaches only the request's key header; never print it.
	readonly key: string;
	// Replaces the model of the endpoint row. `plan` never sets it.
	readonly model?: string;
	readonly timeout?: number;
	readonly retries?: number;
};

type Step = Pick<Attempt, "maker" | "path" | "holder">;

// A maker holds the key of its own API. Any other path is named after the holder of its key,
// so a path with no key holder of its name fails the type check.
const holderOf = (maker: Maker, path: Path): KeyHolder =>
	path === "direct" ? maker : path;

// The paths the value allows, in order, each asked of the one maker.
const steps = (value: unknown): Step[] =>
	VALUE_PATHS[resolve(value)].map((path) => ({
		maker: MAKER,
		path,
		holder: holderOf(MAKER, path),
	}));

/**
 * Returns the value as a provider value when it is a known name, and undefined
 * for anything else, including non-text and inherited property names. Never
 * throws.
 */
export const parseProvider = (value: unknown): ProviderValue | undefined =>
	typeof value === "string" && Object.hasOwn(VALUE_PATHS, value)
		? (value as ProviderValue)
		: undefined;

/**
 * Returns the value when it is a known provider value, and the default typesafe
 * otherwise. Never throws.
 */
export const resolve = (value: unknown): ProviderValue =>
	parseProvider(value) ?? DEFAULT_VALUE;

export const order = (value: unknown): readonly KeyHolder[] =>
	steps(value).map((step) => step.holder);

/**
 * Returns the keys that lookup finds for the key holders the value allows. A
 * key holder the value leaves out is never looked up, and one whose lookup gives
 * undefined has no entry. Each lookup finishes before the next starts, and a
 * rejection stops the rest and passes through.
 */
export async function collectKeys(
	value: unknown,
	lookup: (holder: KeyHolder) => Promise<string | undefined>,
): Promise<Keys> {
	const keys: Keys = {};
	for (const holder of order(value)) {
		const key = await lookup(holder);
		if (key !== undefined) keys[holder] = key;
	}
	return keys;
}

/** The same rule as collectKeys, for a lookup that answers at once. */
export function collectKeysSync(
	value: unknown,
	lookup: (holder: KeyHolder) => string | undefined,
): Keys {
	const keys: Keys = {};
	for (const holder of order(value)) {
		const key = lookup(holder);
		if (key !== undefined) keys[holder] = key;
	}
	return keys;
}

/**
 * Returns one attempt for each path the value allows whose key holder's key is a
 * non-empty string, carrying that key. Every attempt but the last gives up
 * fast, so the next one gets most of the routing limit. Returns no attempts
 * when no key is set. Never throws.
 */
export function plan(value: unknown, keys: Readonly<Keys>): Attempt[] {
	const attempts: Attempt[] = [];
	for (const step of steps(value)) {
		const key = keys[step.holder];
		if (key) attempts.push({ ...step, key });
	}
	return attempts.map((attempt, i) =>
		i < attempts.length - 1
			? { ...attempt, timeout: FIRST_ATTEMPT_TIMEOUT_MS, retries: 0 }
			: attempt,
	);
}
