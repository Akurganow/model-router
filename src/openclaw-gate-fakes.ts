import assert from "node:assert/strict";
import { type Gate, type GateInput, gateSpawn } from "./openclaw-gates.ts";
import type { OpenClawSettings } from "./openclaw-settings.ts";
import type { OpenClawConfig } from "./openclaw-types.ts";

export const SETTINGS: OpenClawSettings = {
	provider: "typesafe",
	scope: "core",
	smallModel: "openai/small",
	largeModel: "openai/large",
};
export const REQUESTER = "main";
export const OTHER = "writer";

export const gate = (overrides: Partial<GateInput> = {}): Gate =>
	gateSpawn({
		params: { task: "do the work" },
		requester: REQUESTER,
		config: {},
		settings: SETTINGS,
		hasKey: true,
		...overrides,
	});
export const withParams = (params: Record<string, unknown>) =>
	gate({ params: { task: "do the work", ...params } });
export const extended = { ...SETTINGS, scope: "extended" as const };

export function routed(result: Gate) {
	assert.equal(result.outcome, "route", JSON.stringify(result));
	return result as Extract<Gate, { outcome: "route" }>;
}
export const skipped = (result: Gate) => {
	assert.equal(result.outcome, "skip", JSON.stringify(result));
	return (result as Extract<Gate, { outcome: "skip" }>).reason;
};
export const effort = (result: Gate) => routed(result).effort;

export const agents = (
	section: NonNullable<OpenClawConfig["agents"]>,
): OpenClawConfig => ({ agents: section });
export const known = (entry: object): OpenClawConfig =>
	agents({ entries: { [OTHER]: entry } });
