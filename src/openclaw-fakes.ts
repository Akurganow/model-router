import type { Fetch } from "@typesafe-ai/sdk";
import { jevAnswer, streamed } from "./jev-fakes.ts";
import type { Clock } from "./openclaw-deadline.ts";
import type {
	BeforeToolCallHandler,
	CommandDefinition,
	ConfigMutation,
	HookOptions,
	Logger,
	ModelRef,
	OpenClawApi,
	OpenClawConfig,
	PluginRuntime,
	ResolvedModelRef,
	ToolDefinition,
} from "./openclaw-types.ts";

type Params<K extends keyof FakeCalls> = FakeCalls[K][number];
type FakeCalls = {
	config: unknown[];
	mutate: ConfigMutation[];
	defaultModel: Parameters<
		PluginRuntime["modelConfig"]["resolveDefaultModelForAgent"]
	>[0][];
	allowedRef: Parameters<
		PluginRuntime["modelConfig"]["resolveAllowedModelRef"]
	>[0][];
	credential: Parameters<
		PluginRuntime["modelAuth"]["isProviderApiKeyConfiguredAsync"]
	>[0][];
	agentDir: { cfg: OpenClawConfig; agentId: string }[];
};
export type RuntimeMember = keyof FakeCalls;

// What the fake runtime answers. A test changes a field between calls.
export type RuntimeAnswers = {
	config: OpenClawConfig;
	defaultModel: ModelRef;
	// Unset: the raw string splits at its first slash into provider and model.
	resolved?: ResolvedModelRef;
	credential: boolean;
	agentDir: string;
};

const SLASH = "/";

function echoRef(raw: string): ResolvedModelRef {
	const cut = raw.indexOf(SLASH);
	const ref =
		cut < 0
			? { provider: "", model: raw }
			: { provider: raw.slice(0, cut), model: raw.slice(cut + 1) };
	return { ref, key: raw };
}

/**
 * A runtime whose members answer from `answers`, record their arguments in `calls`
 * and throw when the test adds their name to `throwOn`.
 */
export function createFakeRuntime(initial: Partial<RuntimeAnswers> = {}) {
	const answers: RuntimeAnswers = {
		config: {},
		defaultModel: { provider: "anthropic", model: "claude-opus-5-5" },
		credential: true,
		agentDir: "/agents/main",
		...initial,
	};
	const calls: FakeCalls = {
		config: [],
		mutate: [],
		defaultModel: [],
		allowedRef: [],
		credential: [],
		agentDir: [],
	};
	const throwOn = new Set<RuntimeMember>();
	const enter = <K extends RuntimeMember>(member: K, call?: Params<K>) => {
		(calls[member] as unknown[]).push(call);
		if (throwOn.has(member)) throw new Error(`fake ${member} failure`);
	};
	const runtime: PluginRuntime = {
		config: {
			current: () => {
				enter("config");
				return answers.config;
			},
			// Like the writer, it rechecks the caller after the mutation and publishes the draft only if that passes.
			mutateConfigFile: async (params) => {
				enter("mutate", params);
				const draft = structuredClone(answers.config);
				await params.mutate(draft);
				params.writeOptions?.assertCurrent?.();
				answers.config = draft;
				return {};
			},
		},
		modelConfig: {
			resolveDefaultModelForAgent: (params) => {
				enter("defaultModel", params);
				return answers.defaultModel;
			},
			resolveAllowedModelRef: (params) => {
				enter("allowedRef", params);
				return answers.resolved ?? echoRef(params.raw);
			},
		},
		modelAuth: {
			isProviderApiKeyConfiguredAsync: async (params) => {
				enter("credential", params);
				return answers.credential;
			},
		},
		agent: {
			resolveAgentDir: (cfg, agentId) => {
				enter("agentDir", { cfg, agentId });
				return answers.agentDir;
			},
		},
	};
	return { runtime, answers, calls, throwOn };
}
export type FakeRuntime = ReturnType<typeof createFakeRuntime>;

export type RecordedHook = {
	event: string;
	handler: BeforeToolCallHandler;
	options?: HookOptions;
};
export type LogLine = { level: keyof Logger; message: string };

export type FakeApiOverrides = Partial<
	Pick<OpenClawApi, "id" | "registrationMode" | "config" | "pluginConfig">
> & { runtime?: FakeRuntime };

/**
 * An `api` that records what the plugin registers and logs.
 * Without a runtime of its own, the api gets one that answers with `config`.
 */
export function createFakeApi(overrides: FakeApiOverrides = {}) {
	const { runtime: given, ...fields } = overrides;
	const config = fields.config ?? {};
	const runtime = given ?? createFakeRuntime({ config });
	const hooks: RecordedHook[] = [];
	const tools: ToolDefinition[] = [];
	const commands: CommandDefinition[] = [];
	const logs: LogLine[] = [];
	const line = (level: keyof Logger) => (message: string) => {
		logs.push({ level, message });
	};
	const api: OpenClawApi = {
		id: "model-router-openclaw",
		registrationMode: "full",
		pluginConfig: {},
		...fields,
		config,
		logger: {
			debug: line("debug"),
			info: line("info"),
			warn: line("warn"),
			error: line("error"),
		},
		runtime: runtime.runtime,
		on: (event, handler, options) => {
			hooks.push(
				options === undefined
					? { event, handler }
					: { event, handler, options },
			);
		},
		registerTool: (tool) => void tools.push(tool),
		registerCommand: (command) => void commands.push(command),
	};
	return {
		api,
		runtime,
		hooks,
		tools,
		commands,
		logs,
		// The handler OpenClaw would call for `before_tool_call`: the last one registered.
		beforeToolCall: (): BeforeToolCallHandler => {
			const hook = hooks.findLast((h) => h.event === "before_tool_call");
			if (hook === undefined)
				throw new Error(
					"createFakeApi: no before_tool_call handler registered",
				);
			return hook.handler;
		},
	};
}

export type Levels = { tier: number; work: number };
export type JevRequest = { url: string; body: unknown; signal?: AbortSignal };
// "hang" holds a request until its signal aborts. A status answers an empty body with that status.
export type JevMode = "answer" | "hang" | { status: number };

function hold(signal: AbortSignal | null | undefined): Promise<never> {
	return new Promise((_, reject) => {
		signal?.addEventListener("abort", () => reject(signal.reason), {
			once: true,
		});
	});
}

/**
 * A fetch that answers every Jev request with the tier and work levels in `levels`.
 * A test changes `levels` or `mode.current` between calls.
 */
export function createJevFetch(initial: Levels = { tier: 1, work: 1 }) {
	const levels = { ...initial };
	const mode: { current: JevMode } = { current: "answer" };
	const requests: JevRequest[] = [];
	const fetch: Fetch = async (url, init) => {
		// Like the real fetch, an aborted signal fails before anything is sent.
		init?.signal?.throwIfAborted();
		const request: JevRequest = { url, body: JSON.parse(String(init?.body)) };
		if (init?.signal) request.signal = init.signal;
		requests.push(request);
		if (mode.current === "hang") return hold(init?.signal);
		if (typeof mode.current === "object")
			return streamed(mode.current.status, {});
		return streamed(200, jevAnswer(levels.tier, levels.work));
	};
	return { fetch, levels, mode, requests };
}

/**
 * A clock that runs a timer only when the test calls `fire`.
 * `delays` lists every delay asked for, cancelled or not, and `live` counts the timers not yet fired or cancelled.
 */
export function createFakeClock() {
	const timers: { ms: number; fn: () => void; live: boolean }[] = [];
	const clock: Clock = {
		after: (ms, fn) => {
			const timer = { ms, fn, live: true };
			timers.push(timer);
			return {
				cancel: () => {
					timer.live = false;
				},
			};
		},
	};
	const fire = () => {
		for (const timer of timers) {
			if (!timer.live) continue;
			timer.live = false;
			timer.fn();
		}
	};
	return {
		clock,
		fire,
		delays: () => timers.map((t) => t.ms),
		live: () => timers.filter((t) => t.live).length,
	};
}
