import assert from "node:assert/strict";
import { test } from "node:test";
import { setsOwnModel } from "../../core/reasons.ts";
import {
	agents,
	effort,
	extended,
	gate,
	known,
	OTHER,
	routed,
	skipped,
	withParams,
} from "./gate-fakes.ts";
import { readSpawn } from "./params.ts";

// Text counts as set only when it is not blank. Any other value counts unless it is null or undefined.
const VALUES: readonly [string, unknown, boolean][] = [
	["an empty string", "", false],
	["a blank string", "  ", false],
	["null", null, false],
	["undefined", undefined, false],
	["zero", 0, true],
	["an empty object", {}, true],
	["a model object", { primary: "x" }, true],
	["a model string", "x/y", true],
];

const other = (config: ReturnType<typeof agents>) =>
	gate({ params: { task: "t", agentId: OTHER }, config, settings: extended });

for (const [name, value, set] of VALUES) {
	test(`${name} as another agent's model ${set ? "skips" : "routes"} the spawn`, () => {
		const result = other(known({ model: value }));
		if (set) assert.equal(skipped(result), setsOwnModel(OTHER));
		else routed(result);
	});

	test(`${name} as the defaults' subagent model ${set ? "skips" : "routes"} the spawn`, () => {
		const result = gate({
			config: agents({ defaults: { subagents: { model: value } } }),
		});
		if (set) assert.equal(skipped(result), "subagent model set");
		else routed(result);
	});

	test(`${name} as the target's subagent model ${set ? "skips" : "routes"} the spawn`, () => {
		const result = other(known({ subagents: { model: value } }));
		if (set) assert.equal(skipped(result), "subagent model set");
		else routed(result);
	});

	test(`${name} as the defaults' subagent thinking ${set ? "keeps" : "sets"} the effort`, () => {
		const result = gate({
			config: agents({ defaults: { subagents: { thinking: value } } }),
		});
		assert.deepEqual(
			effort(result),
			set ? { kind: "keep", label: "config effort" } : { kind: "set" },
		);
	});

	test(`${name} as the requester's subagent thinking ${set ? "keeps" : "sets"} the effort under core`, () => {
		const result = gate({
			config: agents({
				entries: { main: { subagents: { thinking: value } } },
			}),
		});
		assert.deepEqual(
			effort(result),
			set ? { kind: "keep", label: "config effort" } : { kind: "set" },
		);
	});

	test(`${name} as the requester's subagent thinking is replaced under extended`, () => {
		const result = gate({
			config: agents({
				entries: { main: { subagents: { thinking: value } } },
			}),
			settings: extended,
		});
		assert.deepEqual(effort(result), { kind: "set" });
	});

	test(`${name} as the runtime reads ${set ? "as another runtime" : "as unset"}`, () => {
		assert.equal(
			readSpawn({ runtime: value }).runtime,
			set ? "other" : undefined,
		);
		const result = withParams({ runtime: value });
		if (set) assert.deepEqual(result, { outcome: "pass" });
		else routed(result);
	});
}

test("an agent id that is set but not text reads as invalid, a blank one as none", () => {
	for (const [name, value, set] of VALUES) {
		if (typeof value === "string") continue;
		assert.deepEqual(
			readSpawn({ agentId: value }).agent,
			{ kind: set ? "invalid" : "none" },
			name,
		);
	}
});
