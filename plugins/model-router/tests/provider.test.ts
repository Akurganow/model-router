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

// With both keys present, each value asks its first key holder, and a healthy one answers alone.
for (const [gateway, url] of [
	["auto", TYPESAFE_URL],
	["openrouter-first", OPENROUTER_URL],
	["direct", TYPESAFE_URL],
	["openrouter", OPENROUTER_URL],
	// Claude Code hands the plugin the option's default for a stored value
	// outside the option's list, as docs/clients.md, "Hooks module", says. So
	// an unknown value never reaches the plugin here, and the call routes as
	// the default.
	["unknown", TYPESAFE_URL],
] as const)
	test(
		`${gateway} asks its first key holder`,
		{ options: { ...BOTH_KEYS, gateway } },
		async ($, on) => {
			const { h } = await callOnce($, on);
			expect(h.requests.map((r) => r.url)).toEqual([url]);
			expect(h.received.model).toBe("haiku");
		},
	);

// As at the "unknown" table row above, this value routes as the default.
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
	{ options: { ...BOTH_KEYS, gateway: "auto" } },
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
			"L0 haiku · high · p=0.90/0.60 · openrouter jev-1.14.0 · 1/1 tok · typesafe HTTP 503",
		]);
	},
);

test(
	"when both providers fail the skip line names each in order",
	{ options: { ...BOTH_KEYS, gateway: "openrouter-first" } },
	async ($, on) => {
		const h = await retried($, on, {
			replies: [
				{ status: 503, text: "down" },
				{ status: 502, text: "down" },
			],
		});
		// One request to the first provider, then the second with the transport's retries.
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
	"the bare command prints the value, reading no key",
	{ options: { ...BOTH_KEYS, provider: "typesafe" } },
	async ($, on) => {
		const h = harness(on, { env: BOTH_VARIABLES });
		const writes = config(on, (e) => ({ value: e.value }));
		expect(await provider($)).toBe("provider: typesafe");
		expect(h.envReads).toEqual([]);
		expect(h.fetched).toBe(0);
		expect(writes).toEqual([]);
	},
);

test("the bare command prints the default", async ($, on) => {
	harness(on);
	expect(await provider($)).toBe("provider: typesafe");
});

test("a value changes the plugin's provider row", async ($, on) => {
	harness(on);
	const writes = config(on, (e) => ({ value: e.value }));
	expect(await provider($, "typesafe")).toBe("provider: typesafe");
	expect(writes.map((e) => [e.key, e.value])).toEqual([[SETTING, "typesafe"]]);
});

test("a refused change prints the reason", async ($, on) => {
	refusedWrites(on);
	expect(await provider($, "typesafe")).toBe(`provider unchanged: ${REFUSAL}`);
});

// The engine skips a config.set hook that throws, so the test leaves config.set unanswered: the test kit then throws.
test("a change that throws prints the error", async ($, on) => {
	harness(on);
	const text = await provider($, "typesafe");
	expect(text?.startsWith("provider unchanged: ")).toBe(true);
	expect(text).toContain("config.set");
});

test("any other argument lists the three values", async ($, on) => {
	harness(on);
	const writes = config(on, (e) => ({ value: e.value }));
	expect(await provider($, "anthropic")).toBe(
		"provider: use one of typesafe, openai, google",
	);
	expect(writes).toEqual([]);
});

test(
	"a command from a model or a plugin prints the value and writes nothing",
	{ options: { provider: "typesafe" } },
	async ($, on) => {
		harness(on);
		const writes = config(on, (e) => ({ value: e.value }));
		expect(await fromOutside($, COMMAND, "typesafe")).toEqual(
			Array(3).fill("provider: typesafe"),
		);
		expect(writes).toEqual([]);
	},
);

test("a bad value is refused before the origin is read", async ($, on) => {
	harness(on);
	expect(await runCommand($, COMMAND, "anthropic", { kind: "sdk" })).toBe(
		"provider: use one of typesafe, openai, google",
	);
});

test("the gateway command writes the plugin's gateway row", async ($, on) => {
	harness(on);
	const writes = config(on, (e) => ({ value: e.value }));
	expect(await runCommand($, "model-router:gateway", "auto")).toBe(
		"gateway: auto (typesafe, then openrouter)",
	);
	expect(writes.map((e) => [e.key, e.value])).toEqual([
		["model-router.gateway", "auto"],
	]);
});
