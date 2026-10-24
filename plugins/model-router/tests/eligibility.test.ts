import { expect, test } from "claude-code/testing";
import {
	agentCall,
	callOnce,
	harness,
	KEYED,
	offer,
	offerAll,
} from "./harness.ts";

// Each row is a call the hook must leave alone: no request, no log, and no check of its own.
// The engine runs one permission check on every call after the hooks, so one check is the engine's.
for (const [name, over, offers] of [
	["a fork", { subagent_type: "fork" }, undefined],
	["a named agent", { name: "scout" }, undefined],
	["a call with its own model", { model: "sonnet" }, undefined],
	[
		"a user agent with a built-in's name",
		{},
		{ "general-purpose": "userSettings" },
	],
	[
		"a plugin agent with a built-in's name",
		{ subagent_type: "Explore" },
		{ Explore: "plugin" },
	],
	[
		"the statusline-setup built-in",
		{ subagent_type: "statusline-setup" },
		undefined,
	],
	[
		"the claude-code-guide built-in",
		{ subagent_type: "claude-code-guide" },
		undefined,
	],
	["an agent no offer named", { subagent_type: "Plan" }, {}],
	["an agent of a user's own name", { subagent_type: "reviewer" }, undefined],
] as const)
	test(
		`${name} passes through without a check or a request`,
		KEYED,
		async ($, on) => {
			const { h } = await callOnce($, on, over, offers ? { offers } : {});
			expect(h.calls).toBe(1);
			expect(h.received.model).toBe("model" in over ? over.model : undefined);
			expect(h.received.effort).toBeUndefined();
			expect(h.checks.length).toBe(1);
			expect(h.fetched).toBe(0);
			expect(h.logs).toEqual([]);
			expect(h.debug).toEqual([]);
		},
	);

test("the latest offer for a name decides", KEYED, async ($, on) => {
	const h = harness(on);
	await offerAll($);
	await offer($, "general-purpose", "plugin");
	await $.tool.call(agentCall());
	expect(h.fetched).toBe(0);
	await offer($, "general-purpose");
	await $.tool.call(agentCall());
	expect(h.fetched).toBe(1);
	expect(h.seen[1]?.model).toBe("haiku");
});

test("an offer goes on unchanged", KEYED, async ($, on) => {
	harness(on);
	expect(await offer($, "Explore")).toEqual({ isOffered: true });
});

const EXTENDED = { options: { api_key: "test-key", scope: "extended" } };

// Under extended the offers never matter, so the rows differ only in the call.
for (const [name, over] of [
	["a fork", { subagent_type: "fork" }],
	["a named agent", { name: "scout" }],
	["a call with its own model", { model: "sonnet" }],
] as const)
	test(
		`extended: ${name} passes through without a request`,
		EXTENDED,
		async ($, on) => {
			const { h } = await callOnce($, on, over);
			expect(h.calls).toBe(1);
			expect(h.received.model).toBe("model" in over ? over.model : undefined);
			expect(h.received.effort).toBeUndefined();
			expect(h.checks.length).toBe(1);
			expect(h.fetched).toBe(0);
			expect(h.logs).toEqual([]);
		},
	);

for (const [name, over, offers] of [
	[
		"the statusline-setup built-in",
		{ subagent_type: "statusline-setup" },
		undefined,
	],
	[
		"the claude-code-guide built-in",
		{ subagent_type: "claude-code-guide" },
		undefined,
	],
	[
		"a user agent with a built-in's name",
		{},
		{ "general-purpose": "userSettings" },
	],
	[
		"a plugin agent with a built-in's name",
		{ subagent_type: "Explore" },
		{ Explore: "plugin" },
	],
	["an agent no offer named", { subagent_type: "Plan" }, {}],
	["an agent of a user's own name", { subagent_type: "reviewer" }, undefined],
] as const)
	test(
		`extended: ${name} is scored and gets a model`,
		EXTENDED,
		async ($, on) => {
			const { h } = await callOnce($, on, over, offers ? { offers } : {});
			expect(h.fetched).toBe(1);
			expect(h.received.model).toBe("haiku");
			expect(h.received.effort).toBe("high");
		},
	);

test(
	"extended: a call that permission rules deny is not sent",
	EXTENDED,
	async ($, on) => {
		const { h } = await callOnce(
			$,
			on,
			{ subagent_type: "reviewer" },
			{ decision: "deny" },
		);
		expect(h.fetched).toBe(0);
		expect(h.calls).toBe(0);
	},
);
