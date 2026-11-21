// The spawn params, settings and config that stand in for what OpenClaw hands gateSpawn.
import assert from "node:assert/strict";
import {
	type Gate,
	type GateInput,
	gateSpawn,
} from "#adapters/openclaw/gates.ts";
import { readSpawn } from "#adapters/openclaw/params.ts";
import type { OpenClawConfig } from "#adapters/openclaw/types.ts";
import type { Settings } from "#core/options/settings.ts";

export const SETTINGS: Settings = {
	provider: "typesafe",
	gateway: "direct",
	scope: "core",
};
export const REQUESTER = "main";
export const OTHER = "writer";

// A test writes the spawn as the raw params the tool receives.
export type GateOptions = Omit<Partial<GateInput>, "spawn"> & {
	params?: Record<string, unknown>;
};

export const gate = ({
	params = { task: "do the work" },
	...overrides
}: GateOptions = {}): Gate =>
	gateSpawn({
		spawn: readSpawn(params),
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
