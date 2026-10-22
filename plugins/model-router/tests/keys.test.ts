import { expect, test } from "claude-code/testing";
import { callOnce } from "./harness.ts";

const VARIABLE_KEY = "typesafe-var-key";

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
] as const)
	test(name, { options }, async ($, on) => {
		const { h } = await callOnce($, on, {}, { env });
		if (key === null) {
			expect(h.received.model).toBeUndefined();
			expect(h.fetched).toBe(0);
			expect(h.logs).toEqual(["skipped, key unset"]);
			return;
		}
		expect(h.auth).toBe(`Bearer ${key}`);
		expect(h.received.model).toBe("haiku");
		expect([...h.logs, ...h.debug].join("\n")).not.toContain(key);
	});
