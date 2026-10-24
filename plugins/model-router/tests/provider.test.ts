import { type Engine, expect, test } from "claude-code/testing";
import {
	callOnce,
	config,
	fromOutside,
	harness,
	REFUSAL,
	refusedWrites,
	retried,
	runCommand,
} from "./harness.ts";

const TYPESAFE_URL = "https://api.typesafe.ai/v1/systemone";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/systemone";
const BOTH_KEYS = {
	api_key: "typesafe-key",
	openrouter_api_key: "openrouter-key",
};
const BOTH_VARIABLES = {
	TYPESAFE_API_KEY: "typesafe-var-key",
	OPENROUTER_API_KEY: "openrouter-var-key",
};

// With both keys present, each value asks its first provider, and a healthy one answers alone.
for (const [provider, url] of [
	["auto", TYPESAFE_URL],
	["openrouter-first", OPENROUTER_URL],
	["typesafe", TYPESAFE_URL],
	["openrouter", OPENROUTER_URL],
	["unknown", TYPESAFE_URL],
] as const)
	test(
		`${provider} asks its first provider`,
		{ options: { ...BOTH_KEYS, provider } },
		async ($, on) => {
			const { h } = await callOnce($, on);
			expect(h.requests.map((r) => r.url)).toEqual([url]);
			expect(h.received.model).toBe("haiku");
		},
	);

test(
	"an unknown value reads no OpenRouter key",
	{ options: { provider: "unknown", api_key: "", openrouter_api_key: "" } },
	async ($, on) => {
		const { h } = await callOnce($, on, {}, { env: BOTH_VARIABLES });
		expect(h.envReads).toEqual(["TYPESAFE_API_KEY"]);
		expect(h.requests.map((r) => r.url)).toEqual([TYPESAFE_URL]);
	},
);

test(
	"after a 503 the call falls back, each request with its own host, key and jev-latest",
	{ options: { ...BOTH_KEYS, provider: "auto" } },
	async ($, on) => {
		const { h } = await callOnce(
			$,
			on,
			{},
			{ replies: [{ status: 503, text: "down" }, {}] },
		);
		expect(h.requests.map((r) => r.url)).toEqual([
			TYPESAFE_URL,
			OPENROUTER_URL,
		]);
		expect(h.requests.map((r) => r.init?.headers?.Authorization)).toEqual([
			"Bearer typesafe-key",
			"Bearer openrouter-key",
		]);
		expect(h.requests.map((r) => JSON.parse(r.init?.body ?? "").model)).toEqual(
			["jev-latest", "jev-latest"],
		);
		expect(h.received.model).toBe("haiku");
		expect(h.logs).toEqual([
			"L0 haiku · high · p=0.90/0.60 · jev jev-1.14.0 · 1/1 tok · via openrouter (typesafe HTTP 503)",
		]);
	},
);

test(
	"when both providers fail the skip line names each in order",
	{ options: { ...BOTH_KEYS, provider: "openrouter-first" } },
	async ($, on) => {
		const h = await retried($, on, {
			replies: [
				{ status: 503, text: "down" },
				{ status: 502, text: "down" },
			],
		});
		// One request to the first provider, then the second with the SDK's retries.
		expect(h.requests.map((r) => r.url)).toEqual([
			OPENROUTER_URL,
			TYPESAFE_URL,
			TYPESAFE_URL,
			TYPESAFE_URL,
		]);
		expect(h.received.model).toBeUndefined();
		expect(h.logs).toEqual(["skipped, openrouter HTTP 503, typesafe HTTP 502"]);
	},
);

const COMMAND = "model-router:provider";
const SETTING = "model-router.provider";

const provider = ($: Engine, args = "") => runCommand($, COMMAND, args);

test(
	"the bare command prints the value and its order, reading no key",
	{ options: { ...BOTH_KEYS, provider: "auto" } },
	async ($, on) => {
		const h = harness(on, { env: BOTH_VARIABLES });
		const writes = config(on, (e) => ({ value: e.value }));
		expect(await provider($)).toBe(
			"provider: auto (typesafe, then openrouter)",
		);
		expect(h.envReads).toEqual([]);
		expect(h.fetched).toBe(0);
		expect(writes).toEqual([]);
	},
);

test("the bare command prints the default", async ($, on) => {
	harness(on);
	expect(await provider($)).toBe("provider: typesafe (typesafe)");
});

test("a value changes the plugin's provider row", async ($, on) => {
	harness(on);
	const writes = config(on, (e) => ({ value: e.value }));
	expect(await provider($, "openrouter-first")).toBe(
		"provider: openrouter-first (openrouter, then typesafe)",
	);
	expect(writes.map((e) => [e.key, e.value])).toEqual([
		[SETTING, "openrouter-first"],
	]);
});

test("a refused change prints the reason", async ($, on) => {
	refusedWrites(on);
	expect(await provider($, "openrouter")).toBe(
		`provider unchanged: ${REFUSAL}`,
	);
});

// The engine skips a config.set hook that throws, so the test leaves config.set unanswered: the test kit then throws.
test("a change that throws prints the error", async ($, on) => {
	harness(on);
	const text = await provider($, "auto");
	expect(text?.startsWith("provider unchanged: ")).toBe(true);
	expect(text).toContain("config.set");
});

test("any other argument lists the four values", async ($, on) => {
	harness(on);
	const writes = config(on, (e) => ({ value: e.value }));
	expect(await provider($, "anthropic")).toBe(
		"provider: use one of auto, openrouter-first, typesafe, openrouter",
	);
	expect(writes).toEqual([]);
});

test(
	"a command from a model or a plugin prints the value and writes nothing",
	{ options: { provider: "auto" } },
	async ($, on) => {
		harness(on);
		const writes = config(on, (e) => ({ value: e.value }));
		expect(await fromOutside($, COMMAND, "openrouter")).toEqual(
			Array(3).fill("provider: auto (typesafe, then openrouter)"),
		);
		expect(writes).toEqual([]);
	},
);

test("a bad value is refused before the origin is read", async ($, on) => {
	harness(on);
	expect(await runCommand($, COMMAND, "anthropic", { kind: "sdk" })).toBe(
		"provider: use one of auto, openrouter-first, typesafe, openrouter",
	);
});
