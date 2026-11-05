import { ROUTING_LIMIT_MS } from "./compose.ts";
import { streamedFetch } from "./fetch.ts";
import { registerConfig } from "./openclaw-config.ts";
import {
	createBeforeToolCall,
	LINE_PREFIX,
	MIN_DEADLINE_MS,
	type RouterDeps,
	SPAWN_TOOL,
} from "./openclaw-router.ts";
import { PLUGIN_ID } from "./openclaw-settings.ts";
import type { OpenClawApi, OpenClawConfig } from "./openclaw-types.ts";
import { isRecord } from "./part.ts";

// The hook gets this much beyond the routing limit before OpenClaw times it out.
const HOOK_MARGIN_MS = 2000;
const HOOK_TIMEOUT_MAX_MS = 600000;
const PLUGIN_HOOK_TIMEOUT_MS = ROUTING_LIMIT_MS + HOOK_MARGIN_MS;

const realClock: RouterDeps["clock"] = {
	after: (ms, fn) => {
		const timer = setTimeout(fn, ms);
		return { cancel: () => clearTimeout(timer) };
	},
};

const usable = (value: unknown): value is number =>
	typeof value === "number" &&
	Number.isInteger(value) &&
	value > 0 &&
	value <= HOOK_TIMEOUT_MAX_MS;

// OpenClaw's precedence: the per-hook timeout, then the timeout of all the plugin's hooks, then the value the plugin registers with.
function effectiveTimeout(config: OpenClawConfig): number {
	const hooks = config.plugins?.entries?.[PLUGIN_ID]?.hooks;
	const perHook = isRecord(hooks?.timeouts)
		? hooks.timeouts.before_tool_call
		: undefined;
	return [perHook, hooks?.timeoutMs].find(usable) ?? PLUGIN_HOOK_TIMEOUT_MS;
}

// The routing time left once the hook's own margin is kept back, capped at the routing limit.
export const deadlineFor = (timeout: number): number =>
	Math.min(ROUTING_LIMIT_MS, timeout - HOOK_MARGIN_MS);

function warn(api: OpenClawApi, message: string): void {
	try {
		api.logger.warn(LINE_PREFIX + message);
	} catch {
		// A logger that throws cannot report anything.
	}
}

function register(api: OpenClawApi, deps: RouterDeps): void {
	try {
		if (api.registrationMode !== "full") return;
		const timeout = effectiveTimeout(api.config);
		const deadline = deadlineFor(timeout);
		if (deadline < MIN_DEADLINE_MS)
			warn(
				api,
				`the hook timeout is ${timeout} ms, which leaves ${deadline} ms to route; the plugin routes nothing. Set it to ${MIN_DEADLINE_MS + HOOK_MARGIN_MS} ms or more.`,
			);
		// The config tool and the commands register before the hook, so a throw leaves routing off.
		registerConfig(api, deps.env);
		api.on("before_tool_call", createBeforeToolCall(api, deadline, deps), {
			matcher: [SPAWN_TOOL],
			priority: 100,
			timeoutMs: PLUGIN_HOOK_TIMEOUT_MS,
		});
	} catch {
		warn(api, "registration failed; the plugin is inert.");
	}
}

export function createPlugin(
	deps: RouterDeps = {
		fetchFn: streamedFetch,
		clock: realClock,
		env: process.env,
	},
) {
	return { id: PLUGIN_ID, register: (api: OpenClawApi) => register(api, deps) };
}

export default createPlugin();
