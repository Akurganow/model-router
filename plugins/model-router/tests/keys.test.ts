import { expect, test } from "claude-code/testing";
import { callOnce } from "./harness.ts";

const VARIABLE_KEY = "typesafe-var-key";
const OPENROUTER_VARIABLE_KEY = "openrouter-var-key";
const TYPESAFE_URL = "https://api.typesafe.ai/v1/systemone";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/systemone";

// The last column is the key the request carries, or null when the call passes through unrouted.
for (const [name, options, env, key] of [
	["a missing key passes through and says so", {}, {}, null],
	["an empty key passes through like a missing one", { api_key: "" }, {}, null],
	[
		"an empty option and an empty variable pass through as unset",
		{ api_key: "" },
		{ TYPESAFE_API_KEY: "" },
		null,
	],
	[
		"the option is the key when it is set",
		{ api_key: "option-key" },
		{},
		"option-key",
	],
	[
		"TYPESAFE_API_KEY is the key when the option is empty",
		{ api_key: "" },
		{ TYPESAFE_API_KEY: VARIABLE_KEY },
		VARIABLE_KEY,
	],
	[
		"the option wins over the variable",
		{ api_key: "option-key" },
		{ TYPESAFE_API_KEY: VARIABLE_KEY },
		"option-key",
	],
	[
		"a missing OpenRouter key passes through and says so",
		{ provider: "openrouter", openrouter_api_key: "" },
		{ OPENROUTER_API_KEY: "" },
		null,
	],
	[
		"the OpenRouter option is the key when it is set",
		{ provider: "openrouter", openrouter_api_key: "openrouter-option-key" },
		{},
		"openrouter-option-key",
	],
	[
		"OPENROUTER_API_KEY is the key when the OpenRouter option is empty",
		{ provider: "openrouter", openrouter_api_key: "" },
		{ OPENROUTER_API_KEY: OPENROUTER_VARIABLE_KEY },
		OPENROUTER_VARIABLE_KEY,
	],
	[
		"the OpenRouter option wins over its variable",
		{ provider: "openrouter", openrouter_api_key: "openrouter-option-key" },
		{ OPENROUTER_API_KEY: OPENROUTER_VARIABLE_KEY },
		"openrouter-option-key",
	],
] as const)
	test(name, { options }, async ($, on) => {
		const { h } = await callOnce($, on, {}, { env });
		if (key === null) {
			expect(h.received.model).toBeUndefined();
			expect(h.fetched).toBe(0);
			expect(h.logs).toEqual(["skipped, key unset"]);
			return;
		}
		expect(h.request.url).toBe(
			"provider" in options ? OPENROUTER_URL : TYPESAFE_URL,
		);
		expect(h.auth).toBe(`Bearer ${key}`);
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
	{ options: { provider: "openrouter", api_key: "", openrouter_api_key: "" } },
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
