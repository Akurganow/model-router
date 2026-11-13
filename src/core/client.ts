import { type Fetch, TypeSafeClient } from "@typesafe-ai/sdk";
import { HOSTS, type Provider } from "./provider.ts";

// The SDK reads TYPESAFE_BASE_URL and TYPESAFE_API_KEY when it gets no host or key, so both are always passed.
export function createClient(
	provider: Provider,
	apiKey: string | undefined,
	model: string,
	fetchFn: Fetch,
): TypeSafeClient {
	if (!Object.hasOwn(HOSTS, provider))
		throw new Error(`createClient: no host for ${provider}`);
	if (!apiKey)
		throw new Error(
			`createClient: no ${provider} key. Pass a non-empty key for ${provider}.`,
		);
	return new TypeSafeClient({
		apiKey,
		baseURL: HOSTS[provider],
		logLevel: "off",
		defaultModel: model,
		compression: false,
		fetch: fetchFn,
	});
}
