import { expect, test } from "claude-code/testing";
import { callOnce } from "./harness.ts";

const VARIABLE_KEY = "typesafe-var-key";
const OPENROUTER_VARIABLE_KEY = "openrouter-var-key";
const OPENAI_VARIABLE_KEY = "openai-var-key";
const GOOGLE_VARIABLE_KEY = "google-var-key";
const PERPLEXITY_VARIABLE_KEY = "perplexity-var-key";
const TYPESAFE_URL = "https://api.typesafe.ai/v1/systemone";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/systemone";
const OPENAI_URL = "https://api.openai.com/v1/decisions";
const GOOGLE_URL = "https://generativelanguage.googleapis.com/v1beta/decisions";
const PERPLEXITY_URL = "https://api.perplexity.ai/v1/decisions";

// OpenAI's own API answers a list of answers; the harness's default reply is System One's map.
const level = (value: number, probability: number) => ({ value, probability });
const OPENAI_ANSWER = JSON.stringify({
	model: "gpt-6-luna",
	answers: [
		{
			type: "score",
			name: "tier",
			probabilities: [level(0, 0.9), level(1, 0.1), level(2, 0)],
		},
		{
			type: "score",
			name: "work",
			probabilities: [level(0, 0.2), level(1, 0.6), level(2, 0.2)],
		},
	],
	usage: { input_tokens: 1, output_tokens: 1 },
});

// The last two columns are the key the request carries and the address it goes to, both null when the call passes through unrouted.
// The OpenAI row gets OpenAI's list-shaped reply. The Google row gets the harness's default reply, a map, which the Gemini format reads.
for (const [name, options, env, key, address] of [
	["a missing key passes through and says so", {}, {}, null, null],
	[
		"an empty key passes through like a missing one",
		{ api_key: "" },
		{},
		null,
		null,
	],
	[
		"an empty option and an empty variable pass through as unset",
		{ api_key: "" },
		{ TYPESAFE_API_KEY: "" },
		null,
		null,
	],
	[
		"the option is the key when it is set",
		{ api_key: "option-key" },
		{},
		"option-key",
		TYPESAFE_URL,
	],
	[
		"TYPESAFE_API_KEY is the key when the option is empty",
		{ api_key: "" },
		{ TYPESAFE_API_KEY: VARIABLE_KEY },
		VARIABLE_KEY,
		TYPESAFE_URL,
	],
	[
		"the option wins over the variable",
		{ api_key: "option-key" },
		{ TYPESAFE_API_KEY: VARIABLE_KEY },
		"option-key",
		TYPESAFE_URL,
	],
	[
		"a missing OpenRouter key passes through and says so",
		{ gateway: "openrouter", openrouter_api_key: "" },
		{ OPENROUTER_API_KEY: "" },
		null,
		null,
	],
	[
		"the OpenRouter option is the key when it is set",
		{ gateway: "openrouter", openrouter_api_key: "openrouter-option-key" },
		{},
		"openrouter-option-key",
		OPENROUTER_URL,
	],
	[
		"OPENROUTER_API_KEY is the key when the OpenRouter option is empty",
		{ gateway: "openrouter", openrouter_api_key: "" },
		{ OPENROUTER_API_KEY: OPENROUTER_VARIABLE_KEY },
		OPENROUTER_VARIABLE_KEY,
		OPENROUTER_URL,
	],
	[
		"the OpenRouter option wins over its variable",
		{ gateway: "openrouter", openrouter_api_key: "openrouter-option-key" },
		{ OPENROUTER_API_KEY: OPENROUTER_VARIABLE_KEY },
		"openrouter-option-key",
		OPENROUTER_URL,
	],
	[
		"the OpenAI option is the key under provider openai",
		{ provider: "openai", openai_api_key: "openai-option-key" },
		{},
		"openai-option-key",
		OPENAI_URL,
	],
	[
		"OPENAI_API_KEY is the key under provider openai when the option is empty",
		{ provider: "openai", openai_api_key: "" },
		{ OPENAI_API_KEY: OPENAI_VARIABLE_KEY },
		OPENAI_VARIABLE_KEY,
		OPENAI_URL,
	],
	[
		"the Google option is the key under provider google, in the x-goog-api-key header",
		{ provider: "google", google_api_key: "google-option-key" },
		{},
		"google-option-key",
		GOOGLE_URL,
	],
	[
		"GEMINI_API_KEY is the key under provider google when the option is empty",
		{ provider: "google", google_api_key: "" },
		{ GEMINI_API_KEY: GOOGLE_VARIABLE_KEY },
		GOOGLE_VARIABLE_KEY,
		GOOGLE_URL,
	],
	[
		"the Perplexity option is the key under provider perplexity",
		{ provider: "perplexity", perplexity_api_key: "perplexity-option-key" },
		{},
		"perplexity-option-key",
		PERPLEXITY_URL,
	],
	[
		"PERPLEXITY_API_KEY is the key under provider perplexity when the option is empty",
		{ provider: "perplexity", perplexity_api_key: "" },
		{ PERPLEXITY_API_KEY: PERPLEXITY_VARIABLE_KEY },
		PERPLEXITY_VARIABLE_KEY,
		PERPLEXITY_URL,
	],
] as const)
	test(name, { options }, async ($, on) => {
		const own = "provider" in options ? options.provider : undefined;
		const { h } = await callOnce(
			$,
			on,
			{},
			own === "openai" ? { env, text: OPENAI_ANSWER } : { env },
		);
		if (key === null) {
			expect(h.received.model).toBeUndefined();
			expect(h.fetched).toBe(0);
			expect(h.logs).toEqual(["skipped, key unset"]);
			return;
		}
		expect(h.request.url).toBe(address);
		if (own === "google") {
			expect(h.request.init?.headers?.["x-goog-api-key"]).toBe(key);
			expect(h.auth).toBeUndefined();
		} else expect(h.auth).toBe(`Bearer ${key}`);
		expect(h.received.model).toBe("haiku");
		expect([...h.logs, ...h.debug].join("\n")).not.toContain(key);
	});

test(
	"the default reads no OpenRouter key",
	{ options: { api_key: "", openrouter_api_key: "openrouter-option-key" } },
	async ($, on) => {
		const env = {
			TYPESAFE_API_KEY: VARIABLE_KEY,
			OPENROUTER_API_KEY: OPENROUTER_VARIABLE_KEY,
		};
		const { h } = await callOnce($, on, {}, { env });
		expect(h.envReads).toEqual(["TYPESAFE_API_KEY"]);
		expect(h.requests.map((r) => r.url)).toEqual([TYPESAFE_URL]);
		expect(h.auth).toBe(`Bearer ${VARIABLE_KEY}`);
	},
);

test(
	"an openrouter value reads no TypeSafe key",
	{ options: { gateway: "openrouter", api_key: "", openrouter_api_key: "" } },
	async ($, on) => {
		const env = {
			TYPESAFE_API_KEY: VARIABLE_KEY,
			OPENROUTER_API_KEY: OPENROUTER_VARIABLE_KEY,
		};
		const { h } = await callOnce($, on, {}, { env });
		expect(h.envReads).toEqual(["OPENROUTER_API_KEY"]);
		expect(h.requests.map((r) => r.url)).toEqual([OPENROUTER_URL]);
	},
);
