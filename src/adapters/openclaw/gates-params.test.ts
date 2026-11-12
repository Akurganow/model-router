import assert from "node:assert/strict";
import { test } from "node:test";
import { outsideCoreScope, setsOwnModel } from "../../core/reasons.ts";
import {
	effort,
	extended,
	type GateOptions,
	gate,
	known,
	OTHER,
	REQUESTER,
	routed,
	SETTINGS,
	skipped,
	withParams,
} from "./gate-fakes.ts";
import type { OpenClawSettings } from "./settings.ts";

// The sessions_spawn tool reads agentId, label, model and thinking with readToolStringParam: the own key, else the snake-case key, text only, trimmed, empty counted as absent.
const SCOPES: [string, OpenClawSettings][] = [
	["core", SETTINGS],
	["extended", extended],
];
const spawnWith = (params: Record<string, unknown>, over: GateOptions = {}) =>
	gate({ params: { task: "t", ...params }, ...over });

for (const [scope, settings] of SCOPES) {
	test(`under ${scope} an agent_id alone names the target agent`, () => {
		const params = { agent_id: OTHER };
		if (scope === "core")
			return assert.equal(skipped(spawnWith(params)), outsideCoreScope(OTHER));
		assert.equal(
			routed(spawnWith(params, { config: known({}), settings })).target,
			OTHER,
		);
	});

	test(`under ${scope} an agent_id of an agent with its own model is not the requester`, () => {
		const reason = skipped(
			spawnWith(
				{ agent_id: OTHER },
				{ config: known({ model: "x/y" }), settings },
			),
		);
		assert.equal(
			reason,
			scope === "core" ? outsideCoreScope(OTHER) : setsOwnModel(OTHER),
		);
	});

	test(`under ${scope} a whitespace-only agent id is the requesting agent itself`, () => {
		for (const params of [
			{ agentId: "  " },
			{ agentId: "\t\n" },
			{ agent_id: " " },
			{ agentId: " ", agent_id: OTHER },
			{ agentId: "", agent_id: OTHER },
			{ agentId: null, agent_id: OTHER },
		])
			assert.equal(routed(spawnWith(params, { settings })).target, REQUESTER);
	});

	test(`under ${scope} the own agentId key wins over agent_id`, () => {
		const config = known({});
		assert.equal(
			routed(
				spawnWith(
					{ agentId: REQUESTER, agent_id: OTHER },
					{ config, settings },
				),
			).target,
			REQUESTER,
		);
		const winner = spawnWith(
			{ agentId: OTHER, agent_id: REQUESTER },
			{ config, settings },
		);
		if (scope === "core")
			assert.equal(skipped(winner), outsideCoreScope(OTHER));
		else assert.equal(routed(winner).target, OTHER);
	});

	test(`under ${scope} an agent_id is trimmed and matched after normalising`, () => {
		const params = { agent_id: ` ${REQUESTER.toUpperCase()} ` };
		assert.equal(routed(spawnWith(params, { settings })).target, REQUESTER);
	});
}

test("a model that is blank or not text names no model, as the tool reads it", () => {
	for (const model of [
		"  ",
		" default ",
		"Default",
		" DEFAULT ",
		5,
		{ primary: "x/y" },
		[],
	])
		routed(withParams({ model }));
	assert.deepEqual(withParams({ model: " openai/gpt-5 " }), {
		outcome: "pass",
	});
});

test("a thinking param counts only as trimmed text", () => {
	const set = { kind: "set" };
	for (const value of [{ level: "low" }, 5, true])
		assert.deepEqual(effort(withParams({ thinking: value })), set);
	assert.deepEqual(effort(withParams({ thinking: " low " })), {
		kind: "keep",
		label: "caller effort",
	});
});
