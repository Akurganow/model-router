import assert from "node:assert/strict";
import { test } from "node:test";
import { register } from "./claude.ts";

type Hook = ($: unknown, e: unknown, next: unknown) => Promise<unknown>;

function registered(): Record<string, Hook> {
	const hooks: Record<string, Hook> = {};
	const on = (event: string, ...rest: unknown[]) => {
		hooks[event] = rest.at(-1) as Hook;
		return { catch: () => undefined };
	};
	register(on as never, {});
	return hooks;
}

test("a new registration forgets the offers made before it", async () => {
	const logs: string[] = [];
	const $ = {
		clock: {
			after: () => ({ cancel() {} }),
			sleep: () => new Promise(() => {}),
		},
		env: { get: async () => undefined },
		tool: { check: async () => ({ decision: "allow" }) },
		ui: { log: async (text: string) => logs.push(text) },
	};
	const next = Object.assign(async () => ({}), {
		signal: new AbortController().signal,
	});
	const call = { tool: "Agent", prompt: "p", description: "d" };

	await registered()["agent.offer"]?.(
		$,
		{ agent: "general-purpose", source: "built-in" },
		next,
	);
	const fresh = registered();
	await fresh["tool.call"]?.($, call, next);
	assert.deepEqual(logs, []);

	await fresh["agent.offer"]?.(
		$,
		{ agent: "general-purpose", source: "built-in" },
		next,
	);
	await fresh["tool.call"]?.($, call, next);
	assert.deepEqual(logs, ["skipped, key unset"]);
});
