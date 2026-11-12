import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { JEV, lines, setup } from "./handler-fakes.ts";
import type { BeforeToolCallResult } from "./types.ts";

const PREFIX = "model-router ";
const MODELS = { small: "openai/small", large: "openai/large" };
type Models = { small?: string; large?: string };

// Level 1 changes no model, so it needs neither slot; an end level needs its own slot only.
// The effort is the ladder's for the work level 1.
type Row = {
	readonly tier: 0 | 1 | 2;
	readonly set: Models;
	readonly result: BeforeToolCallResult | undefined;
	readonly line: string;
};
const routed = (target: string, effort: string, tier: number) =>
	`${PREFIX}L${tier} ${target} · ${effort} · p=0.90/0.90${JEV}`;
const skipped = (reason: string) => `${PREFIX}skipped, ${reason}`;

const ROWS: readonly Row[] = [
	{
		tier: 0,
		set: MODELS,
		result: { params: { model: "openai/small", thinking: "high" } },
		line: routed("openai/small", "high", 0),
	},
	{
		tier: 0,
		set: { small: MODELS.small },
		result: { params: { model: "openai/small", thinking: "high" } },
		line: routed("openai/small", "high", 0),
	},
	{
		tier: 0,
		set: { large: MODELS.large },
		result: undefined,
		line: skipped("small model unset"),
	},
	{
		tier: 1,
		set: MODELS,
		result: { params: { thinking: "medium" } },
		line: routed("no change", "medium", 1),
	},
	{
		tier: 1,
		set: { small: MODELS.small },
		result: { params: { thinking: "medium" } },
		line: routed("no change", "medium", 1),
	},
	{
		tier: 1,
		set: { large: MODELS.large },
		result: { params: { thinking: "medium" } },
		line: routed("no change", "medium", 1),
	},
	{
		tier: 2,
		set: MODELS,
		result: { params: { model: "openai/large", thinking: "medium" } },
		line: routed("openai/large", "medium", 2),
	},
	{
		tier: 2,
		set: { large: MODELS.large },
		result: { params: { model: "openai/large", thinking: "medium" } },
		line: routed("openai/large", "medium", 2),
	},
	{
		tier: 2,
		set: { small: MODELS.small },
		result: undefined,
		line: skipped("large model unset"),
	},
];

const settings = ({ small = "", large = "" }: Models) => ({
	small_model: small,
	large_model: large,
});
const name = (set: Models) =>
	[set.small && "small", set.large && "large"].filter(Boolean).join(" and ") ||
	"no";

describe("the slot and model each level takes", () => {
	for (const { tier, set, result, line } of ROWS)
		it(`level ${tier} with ${name(set)} model set returns ${JSON.stringify(result)}`, async () => {
			const s = setup({
				levels: { tier, work: 1 },
				settings: settings(set),
			});
			assert.deepEqual(await s.call(), result);
			assert.deepEqual(lines(s), [line]);
		});

	for (const tier of [0, 1, 2] as const)
		it(`level ${tier} with both models unset skips before Jev is asked`, async () => {
			const s = setup({
				levels: { tier, work: 1 },
				settings: settings({}),
			});
			assert.equal(await s.call(), undefined);
			assert.deepEqual(lines(s), [skipped("no small or large model")]);
			assert.equal(s.jev.requests.length, 0);
		});

	it("level 1 routes with an unresolved model, and no check runs", async () => {
		const s = setup({ levels: { tier: 1, work: 1 } });
		s.runtime.answers.resolved = { error: "not allowed" };
		s.runtime.answers.credential = false;
		assert.deepEqual(await s.call(), { params: { thinking: "medium" } });
		assert.deepEqual(lines(s), [routed("no change", "medium", 1)]);
	});

	for (const [tier, slot] of [
		[0, "small"],
		[2, "large"],
	] as const)
		it(`level ${tier} with an unresolved ${slot} model skips and merges nothing`, async () => {
			const s = setup({ levels: { tier, work: 1 } });
			s.runtime.answers.resolved = { error: "not allowed" };
			assert.equal(await s.call(), undefined);
			assert.deepEqual(lines(s), [skipped(`${slot} model unresolved`)]);
		});
});
