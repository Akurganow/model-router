import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_ROLE } from "./brief.ts";
import { routedCall } from "./claude-fakes.ts";
import { useWorld } from "./omp-fakes.ts";
import { createExtension } from "./omp-router.ts";

// Claude Code words its general-purpose agent differently from omp, so both sides must ignore their wording.
const CLAUDE_WORDING = "Claude Code wording";

type Body = { state: { role: unknown } };

const world = useWorld();

for (const agent of ["general-purpose", "claude"])
	test(`${agent} and omp task send the same fixed role`, async () => {
		const { roles } = await routedCall(
			{ api_key: "ts-key" },
			{},
			[{ agent, source: "built-in", description: CLAUDE_WORDING }],
			agent,
		);
		createExtension(world.imports)(world.pi);
		await world.toolCall("c", { tasks: [{ task: "a" }] });
		const fromOmp = (world.sent[0]?.body as Body | undefined)?.state.role;
		assert.equal(roles[0], DEFAULT_ROLE);
		assert.equal(fromOmp, DEFAULT_ROLE);
	});
