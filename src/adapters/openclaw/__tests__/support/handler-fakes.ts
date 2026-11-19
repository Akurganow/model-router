// The api, scoring fetch and clock that stand in for OpenClaw and the scoring provider.
import { createFakeClock } from "../../../../utils/__tests__/support/fake-clock.ts";
import { createBeforeToolCall, SPAWN_TOOL } from "../../router.ts";
import type { OpenClawConfig, ToolContext } from "../../types.ts";
import {
	createFakeApi,
	createScoringFetch,
	type FakeApiOverrides,
	type Levels,
} from "./fakes.ts";

// The shared set-up of the handler tests: an api, a scoring fetch and a clock, with one handler.
export const SETTINGS = {
	provider: "typesafe",
	small_model: "openai/small",
	large_model: "openai/large",
	api_key: "typesafe-key",
};
export const DEADLINE_MS = 8000;
export const REQUESTER = "main";
export const CONTEXT: ToolContext = {
	toolName: SPAWN_TOOL,
	agentId: REQUESTER,
};
export const TASK = "do the work";
export const SUFFIX = " · jev jev-1.14.0 · 812/9 tok";
type Setup = {
	levels?: Levels;
	settings?: Record<string, unknown>;
	config?: OpenClawConfig;
	env?: Record<string, string>;
	deadlineMs?: number;
	api?: FakeApiOverrides;
};

/**
 * Builds a fake api with the config tool, a scoring fetch, a fake clock and the
 * before_tool_call handler wired to them, plus a `call` that sends a
 * `sessions_spawn` event with the task and the given params. Every option has a
 * default. Never throws.
 */
export function setup(options: Setup = {}) {
	const fake = createFakeApi({
		config: options.config ?? {},
		pluginConfig: { ...SETTINGS, ...options.settings },
		...options.api,
	});
	const scoring = createScoringFetch(options.levels);
	const time = createFakeClock();
	const handler = createBeforeToolCall(
		fake.api,
		options.deadlineMs ?? DEADLINE_MS,
		{ fetchFn: scoring.fetch, clock: time.clock, env: options.env ?? {} },
	);
	const call = (
		params: Record<string, unknown> = {},
		ctx: ToolContext = CONTEXT,
	) =>
		handler({ toolName: SPAWN_TOOL, params: { task: TASK, ...params } }, ctx);
	return { ...fake, scoring, time, handler, call };
}
export const lines = (s: ReturnType<typeof setup>) =>
	s.logs.map((l) => l.message);
// Index access by a variable key, which the strict index-signature rule allows.
export const field = (
	record: Record<string, unknown> | undefined,
	key: string,
) => record?.[key];
export const settle = () => new Promise((resolve) => setImmediate(resolve));
