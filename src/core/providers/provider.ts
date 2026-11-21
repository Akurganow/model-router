// Whose model scores. Every table keyed by maker follows this list.
export const MAKERS = ["typesafe", "openai", "google"] as const;
export type Maker = (typeof MAKERS)[number];
// Who holds a key: each maker for its own API, and OpenRouter for the gateway to every maker.
// An attempt shows this name in every line.
export const KEY_HOLDERS = [...MAKERS, "openrouter"] as const;
export type KeyHolder = (typeof KEY_HOLDERS)[number];
// How a maker is asked: its own API, or OpenRouter as the gateway.
export const PATHS = ["direct", "openrouter"] as const;
export type Path = (typeof PATHS)[number];
// How OpenRouter is used for the maker, from its own API only to OpenRouter only. The first value is the default.
export const GATEWAYS = [
	"direct",
	"auto",
	"openrouter-first",
	"openrouter",
] as const;
export type Gateway = (typeof GATEWAYS)[number];

// Every harness reads a key holder's key from the same variable.
export const KEY_VARIABLES: Readonly<Record<KeyHolder, string>> = {
	typesafe: "TYPESAFE_API_KEY",
	openai: "OPENAI_API_KEY",
	google: "GEMINI_API_KEY",
	openrouter: "OPENROUTER_API_KEY",
};

// The setting name that holds each key holder's key in Claude Code and OpenClaw.
export const KEY_FIELDS = {
	typesafe: "api_key",
	openai: "openai_api_key",
	google: "google_api_key",
	openrouter: "openrouter_api_key",
} as const satisfies Readonly<Record<KeyHolder, string>>;

// The key each key holder has, as the harness read it.
export type Keys = Partial<Record<KeyHolder, string>>;

export const FIRST_ATTEMPT_TIMEOUT_MS = 5000;

// The paths each gateway value allows, in the order they are asked.
const GATEWAY_PATHS: Readonly<Record<Gateway, readonly Path[]>> = {
	direct: ["direct"],
	auto: ["direct", "openrouter"],
	"openrouter-first": ["openrouter", "direct"],
	openrouter: ["openrouter"],
};

// The two settings that decide who is asked.
export type Choice = { readonly provider: Maker; readonly gateway: Gateway };
// Stands in for a choice when a stored setting is not valid. It carries the skip reason, and nobody is asked.
export type NoChoice = { readonly skipped: string };

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

// The paths of the gateway, in order, each asked of the choice's maker.
const steps = (choice: Choice): Step[] =>
	GATEWAY_PATHS[choice.gateway].map((path) => ({
		maker: choice.provider,
		path,
		holder: holderOf(choice.provider, path),
	}));

/**
 * Returns the key holders the choice asks, in order. Returns none for a NoChoice,
 * so nobody is asked and no key is looked up.
 */
export const holders = (choice: Choice | NoChoice): readonly KeyHolder[] =>
	"skipped" in choice ? [] : steps(choice).map((step) => step.holder);

/**
 * Returns the keys that lookup finds for the key holders the choice asks. A key
 * holder the choice leaves out is never looked up, and one whose lookup gives
 * undefined has no entry. Each lookup finishes before the next starts, and a
 * rejection stops the rest and passes through.
 */
export async function collectKeys(
	choice: Choice | NoChoice,
	lookup: (holder: KeyHolder) => Promise<string | undefined>,
): Promise<Keys> {
	const keys: Keys = {};
	for (const holder of holders(choice)) {
		const key = await lookup(holder);
		if (key !== undefined) keys[holder] = key;
	}
	return keys;
}

/** The same rule as collectKeys, for a lookup that answers at once. */
export function collectKeysSync(
	choice: Choice | NoChoice,
	lookup: (holder: KeyHolder) => string | undefined,
): Keys {
	const keys: Keys = {};
	for (const holder of holders(choice)) {
		const key = lookup(holder);
		if (key !== undefined) keys[holder] = key;
	}
	return keys;
}

/**
 * Returns one attempt for each path of the choice whose key holder's key is a
 * non-empty string, carrying that key. Every attempt but the last gives up
 * fast, so the next one gets the rest of the routing limit. Returns no attempts
 * when no key is set. Never throws.
 */
export function plan(choice: Choice, keys: Readonly<Keys>): Attempt[] {
	const attempts: Attempt[] = [];
	for (const step of steps(choice)) {
		const key = keys[step.holder];
		if (key) attempts.push({ ...step, key });
	}
	return attempts.map((attempt, i) =>
		i < attempts.length - 1
			? { ...attempt, timeout: FIRST_ATTEMPT_TIMEOUT_MS, retries: 0 }
			: attempt,
	);
}
