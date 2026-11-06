import type { Fetch } from "@typesafe-ai/sdk";
import { jevAnswer, streamed } from "./jev-fakes.ts";
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
	RegistrationMode,
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

/**
 * Returns the resolved ref a raw model string names, split at its first slash
 * into provider and model. Without a slash the provider is empty. The key is the
 * raw string. Never throws.
 */
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
	/** Records a call to a runtime member. Throws when the test added the member to `throwOn`. */
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
			/**
			 * Applies `mutate` to a copy of the config and publishes the copy. Like the
			 * writer, it rechecks the caller after the mutation and publishes the draft
			 * only if that passes. Rejects when the member is in `throwOn`, when `mutate`
			 * throws or when the recheck throws, and the config stays as it was.
			 */
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
			/** Returns the `resolved` answer when set, else the ref echoRef gives. Throws when the member is in `throwOn`. */
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

// The modes in which OpenClaw keeps what a plugin registers with `on`, `registerTool` and
// `registerCommand`. In the other modes it swaps those members for no-ops
// (src/plugins/api-builder.ts, src/plugins/registry-api.ts).
const LIVE_MODES: readonly RegistrationMode[] = [
	"full",
	"discovery",
	"tool-discovery",
];

export type FakeApiOverrides = Partial<
	Pick<OpenClawApi, "id" | "registrationMode" | "config" | "pluginConfig">
> & { runtime?: FakeRuntime };

/**
 * An `api` that records what the plugin registers and logs, as one OpenClaw
 * registry does for one pass. `registrationMode` defaults to full. In a mode that
 * drops registrations, the members record the call by name in `ignored` instead.
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
	const ignored: string[] = [];
	/** Runs `keep` when the api's mode keeps registrations, else records `member` in `ignored`. */
	const register = (member: string, keep: () => void) =>
		LIVE_MODES.includes(api.registrationMode)
			? keep()
			: void ignored.push(member);
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
		/** Records the hook. The options are recorded only when given. Never throws. */
		on: (event, handler, options) =>
			register("on", () =>
				hooks.push(
					options === undefined
						? { event, handler }
						: { event, handler, options },
				),
			),
		registerTool: (tool) => register("registerTool", () => tools.push(tool)),
		registerCommand: (command) =>
			register("registerCommand", () => commands.push(command)),
	};
	return {
		api,
		runtime,
		hooks,
		tools,
		commands,
		logs,
		ignored,
		/**
		 * Returns the handler OpenClaw would call for `before_tool_call`: the last
		 * one registered. Throws when none is registered.
		 */
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
	/**
	 * Records the request and answers it by `mode`. Rejects with the signal's reason
	 * when the signal is already aborted. A `hang` mode holds the request until its
	 * signal aborts, a status mode answers an empty body with that status, and the
	 * other mode answers the levels. Rejects when the body is not JSON.
	 */
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
