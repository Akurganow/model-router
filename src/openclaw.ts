import { realClock } from "./deadline.ts";
import { streamedFetch } from "./fetch.ts";
import { LINE_PREFIX } from "./line.ts";
import {
	registerConfigCommands,
	registerConfigTool,
} from "./openclaw-config.ts";
import {
	deadlineFor,
	HOOK_TIMEOUT_MS,
	MIN_DEADLINE_MS,
	MIN_TIMEOUT_MS,
} from "./openclaw-deadline.ts";
import {
	createBeforeToolCall,
	HOOK,
	type RouterDeps,
	SPAWN_TOOL,
} from "./openclaw-router.ts";
import { PLUGIN_ID, pluginEntry } from "./openclaw-settings.ts";
import type {
	OpenClawApi,
	OpenClawConfig,
	RegistrationMode,
} from "./openclaw-types.ts";
import { isRecord } from "./part.ts";

const HOOK_TIMEOUT_MAX_MS = 600000;

/**
 * Tells whether a value is an integer timeout above 0 and at most
 * HOOK_TIMEOUT_MAX_MS. Never throws.
 */
const usable = (value: unknown): value is number =>
	typeof value === "number" &&
	Number.isInteger(value) &&
	value > 0 &&
	value <= HOOK_TIMEOUT_MAX_MS;

/**
 * Returns the timeout in milliseconds that OpenClaw applies to the hook. The
 * precedence is the per-hook timeout, then the timeout of all the plugin's
 * hooks, then the value the plugin registers with. A value that is not usable is
 * skipped. Never throws.
 */
function effectiveTimeout(config: OpenClawConfig): number {
	const hooks = pluginEntry(config)?.hooks;
	const perHook = isRecord(hooks?.timeouts)
		? hooks.timeouts.before_tool_call
		: undefined;
	return [perHook, hooks?.timeoutMs].find(usable) ?? HOOK_TIMEOUT_MS;
}

/**
 * Logs a warning under the line prefix. Never throws, because a logger that
 * throws cannot report anything.
 */
function warn(api: OpenClawApi, message: string): void {
	try {
		api.logger.warn(LINE_PREFIX + message);
	} catch {
		// A logger that throws cannot report anything.
	}
}

// A Gateway registers a plugin once per pass, and each pass fills its own registry. An agent run
// reads the tool from the full, discovery and tool-discovery registries. Chat dispatch reads
// the commands from the full and discovery registries, and the discovery one wins inside a
// turn. A chat turn scoped to a discovery registry runs its hooks from that registry alone,
// so the hook goes into full and discovery. In the setup and CLI modes OpenClaw drops all
// three registrations.
const TOOL_MODES: readonly RegistrationMode[] = [
	"full",
	"discovery",
	"tool-discovery",
];
const COMMAND_MODES: readonly RegistrationMode[] = ["full", "discovery"];
const HOOK_MODES: readonly RegistrationMode[] = ["full", "discovery"];

/**
 * Registers the before_tool_call hook. In the full pass it first warns when the
 * hook timeout leaves too little time to route, so the warning comes once per
 * Gateway start and not once per discovery pass.
 */
function registerRouting(api: OpenClawApi, deps: RouterDeps): void {
	const timeout = effectiveTimeout(api.config);
	const deadline = deadlineFor(timeout);
	if (api.registrationMode === "full" && deadline < MIN_DEADLINE_MS)
		warn(
			api,
			`the hook timeout is ${timeout} ms, which leaves ${deadline} ms to route; the plugin routes nothing. Set it to ${MIN_TIMEOUT_MS} ms or more.`,
		);
	api.on(HOOK, createBeforeToolCall(api, deadline, deps), {
		matcher: [SPAWN_TOOL],
		priority: 100,
		timeoutMs: HOOK_TIMEOUT_MS,
	});
}

/**
 * Registers what the registration mode keeps. The config tool goes into the full,
 * discovery and tool-discovery passes, and the two commands and the
 * before_tool_call hook into the full and discovery passes, so no registry holds a
 * name twice. The timeout warning belongs to the full pass alone. The setup and CLI
 * modes register nothing. Never throws: a failure logs a warning and leaves the
 * plugin inert.
 */
function register(api: OpenClawApi, deps: RouterDeps): void {
	try {
		const mode = api.registrationMode;
		// The config tool and the commands register before the hook, so a throw leaves routing off.
		if (TOOL_MODES.includes(mode)) registerConfigTool(api, deps.env);
		if (COMMAND_MODES.includes(mode)) registerConfigCommands(api, deps.env);
		if (HOOK_MODES.includes(mode)) registerRouting(api, deps);
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
