import { type Fetch, TypeSafeClient } from "@typesafe-ai/sdk";

// The SDK appends /v1/systemone. The key goes only to this host.
export const TYPESAFE_BASE_URL = "https://api.typesafe.ai";

export function createClient(
	apiKey: string,
	model: string,
	fetchFn: Fetch,
): TypeSafeClient {
	return new TypeSafeClient({
		apiKey,
		baseURL: TYPESAFE_BASE_URL,
		logLevel: "off",
		defaultModel: model,
		compression: false,
		fetch: fetchFn,
	});
}
