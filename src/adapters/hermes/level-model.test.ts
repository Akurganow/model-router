import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ROUTING_LIMIT_MS } from "../../core/compose.ts";
import { createFakeClock } from "../../utils/fake-clock.ts";
import { createScriptedJev } from "./fakes.ts";
import { routeRequest } from "./route.ts";

const SUFFIX = " · jev jev-1.14.0 · 812/9 tok";
const MODELS = { small: "openai/small", large: "openai/large" };
type Models = { small?: string; large?: string };
const SLOTS_SET: readonly [string, Models][] = [
	["both models", MODELS],
	["the small model only", { small: MODELS.small }],
	["the large model only", { large: MODELS.large }],
	["no model", {}],
];

async function respond(tier: number, models: Models) {
	const time = createFakeClock();
	const jev = createScriptedJev(
		[{ host: "api.typesafe.ai", reply: { levels: { tier, work: 1 } } }],
		time.fire,
	);
	return routeRequest(
		{
			task: "Rename the helper.",
			context: "",
			provider: "typesafe",
			keys: { typesafe: "typesafe-key" },
			budgetMs: ROUTING_LIMIT_MS,
			models,
			keptEffort: null,
			description: "",
		},
		{ fetchFn: jev.fetch, clock: time.clock },
	);
}

const route = (
	tier: number,
	slot: string | null,
	target: string,
	effort: string,
) => ({
	outcome: "route",
	slot,
	effort,
	line: `model-router L${tier} ${target} · ${effort} · p=0.90/0.90${SUFFIX}`,
});
const skip = (reason: string) => ({
	outcome: "skip",
	line: `model-router skipped, ${reason}`,
});

// The ladder's effort at work level 1 is high at level 0 and medium at the other levels.
const EXPECTED = (tier: 0 | 1 | 2, models: Models) => {
	if (tier === 1) return route(1, null, "no change", "medium");
	if (tier === 0)
		return models.small === undefined
			? skip("small model unset")
			: route(0, "small", models.small, "high");
	return models.large === undefined
		? skip("large model unset")
		: route(2, "large", models.large, "medium");
};

describe("the slot and model each level takes", () => {
	for (const tier of [0, 1, 2] as const)
		for (const [name, models] of SLOTS_SET)
			it(`level ${tier} with ${name} set gives ${JSON.stringify(EXPECTED(tier, models))}`, async () => {
				assert.deepEqual(await respond(tier, models), EXPECTED(tier, models));
			});

	it("a blank model counts as unset", async () => {
		assert.deepEqual(
			await respond(0, { small: "  ", large: MODELS.large }),
			skip("small model unset"),
		);
	});
});
