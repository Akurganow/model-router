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
export type Provider = "typesafe" | "openrouter";

// The SDK appends /v1/systemone to the host.
export const HOSTS: Readonly<Record<Provider, string>> = {
	typesafe: "https://api.typesafe.ai",
	openrouter: "https://openrouter.ai/api",
};

export const FIRST_ATTEMPT_TIMEOUT_MS = 2000;
// Both providers resolve this alias to their newest Jev release.
const MODEL = "jev-latest";
const DEFAULT_VALUE: ProviderValue = "typesafe";
const FALLBACK_STATUSES: ReadonlySet<number> = new Set([
	401, 402, 403, 404, 408, 429,
]);
const SERVER_ERRORS = { min: 500, max: 599 };

const ORDER: Readonly<Record<ProviderValue, readonly Provider[]>> = {
	auto: ["typesafe", "openrouter"],
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

const resolve = (value: unknown): ProviderValue =>
	typeof value === "string" && Object.hasOwn(ORDER, value)
		? (value as ProviderValue)
		: DEFAULT_VALUE;

export const order = (value: unknown): readonly Provider[] =>
	ORDER[resolve(value)];

// Every attempt but the last gives up fast, so the next one gets most of the routing limit.
export function plan(
	value: unknown,
	present: Readonly<Record<Provider, boolean>>,
): Attempt[] {
	const providers = order(value).filter((p) => present[p]);
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
