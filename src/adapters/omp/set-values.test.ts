import assert from "node:assert/strict";
import { test } from "node:test";
import { extend } from "./fake-agents.ts";
import { useWorld } from "./fakes.ts";
import { checkGates } from "./gates.ts";

const world = useWorld();

// Text counts as set only when it is not blank. Any other value counts unless it is null or undefined.
const VALUES: readonly [string, unknown, boolean][] = [
	["an empty string", "", false],
	["a blank string", "  ", false],
	["null", null, false],
	["undefined", undefined, false],
	["zero", 0, true],
	["an empty object", {}, true],
	["a model object", { primary: "x" }, true],
	["a model string", "anthropic/claude-x", true],
];

// The skip reason of the spawn's agent, or undefined when every gate is open.
const closedFor = async (agent: string) => {
	const result = await checkGates(world.imports, world.pi, world.ctx(), {
		agent,
	});
	return "closed" in result ? result.closed : undefined;
};

for (const [name, value, set] of VALUES) {
	test(`${name} as the task model role ${set ? "is" : "is not"} a user choice`, async () => {
		world.config.modelRoles = { task: value };
		assert.equal(
			await closedFor("task"),
			set ? "task model role set" : undefined,
		);
	});

	test(`${name} as the task model override ${set ? "is" : "is not"} a user choice`, async () => {
		world.config["task.agentModelOverrides"] = { task: value };
		assert.equal(
			await closedFor("task"),
			set ? "task model override set" : undefined,
		);
	});

	test(`${name} as another agent's model override ${set ? "is" : "is not"} a user choice`, async () => {
		extend(world);
		world.config["task.agentModelOverrides"] = { scout: value };
		assert.equal(
			await closedFor("scout"),
			set ? "scout model override set" : undefined,
		);
	});
}
