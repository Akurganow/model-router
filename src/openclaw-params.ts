import { nonEmpty } from "./part.ts";

type Params = Readonly<Record<string, unknown>>;

// OpenClaw's `toSnakeCaseKey` in src/param-key.ts.
const snakeCase = (key: string): string =>
	key
		.replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
		.replace(/([a-z0-9])([A-Z])/g, "$1_$2")
		.toLowerCase();

/**
 * OpenClaw's `readSnakeCaseParamRaw`: the own key, else its snake-case form.
 * An own key wins even when its value is empty or not text.
 */
export function readParam(params: Params, key: string): unknown {
	if (Object.hasOwn(params, key)) return params[key];
	const snake = snakeCase(key);
	return Object.hasOwn(params, snake) ? params[snake] : undefined;
}

/** OpenClaw's `readToolStringParam`: text only, trimmed, and empty counts as absent. */
export const readStringParam = (
	params: Params,
	key: string,
): string | undefined => nonEmpty(readParam(params, key));

/** Config values may be objects, such as a model with fallbacks, so only text is checked for blankness. */
export const isSet = (v: unknown): boolean =>
	typeof v === "string"
		? nonEmpty(v) !== undefined
		: v !== undefined && v !== null;

// `invalid` is an agent id that is set but not text.
export type SpawnAgent =
	| { readonly kind: "none" }
	| { readonly kind: "id"; readonly id: string }
	| { readonly kind: "invalid" };

// What a `sessions_spawn` call asks for, read once by the tool's own rules (src/agents/tools/sessions-spawn-tool.ts).
export type SpawnRequest = {
	// Kept as written, because the brief is built from it.
	readonly task: string | undefined;
	readonly agent: SpawnAgent;
	readonly model: string | undefined;
	readonly thinking: string | undefined;
	// The label, else the task name, else empty.
	readonly description: string;
	// Unset, the subagent runtime, or any other value that is set.
	readonly runtime: "subagent" | "other" | undefined;
	readonly visible: boolean;
	readonly context: "fork" | "isolated" | undefined;
	readonly mode: "run" | "session" | undefined;
	readonly thread: boolean;
};

const SUBAGENT_RUNTIME = "subagent";

function readAgent(params: Params): SpawnAgent {
	const raw = readParam(params, "agentId");
	if (typeof raw !== "string")
		return isSet(raw) ? { kind: "invalid" } : { kind: "none" };
	const id = nonEmpty(raw);
	return id === undefined ? { kind: "none" } : { kind: "id", id };
}

function readRuntime(params: Params): SpawnRequest["runtime"] {
	const { runtime } = params;
	if (!isSet(runtime)) return undefined;
	return runtime === SUBAGENT_RUNTIME ? SUBAGENT_RUNTIME : "other";
}

export function readSpawn(params: Params): SpawnRequest {
	const { task, taskName, visible, context, mode, thread } = params;
	return {
		task: typeof task === "string" ? task : undefined,
		agent: readAgent(params),
		model: readStringParam(params, "model"),
		thinking: readStringParam(params, "thinking"),
		description: readStringParam(params, "label") ?? nonEmpty(taskName) ?? "",
		runtime: readRuntime(params),
		visible: visible === true,
		context: context === "fork" || context === "isolated" ? context : undefined,
		mode: mode === "run" || mode === "session" ? mode : undefined,
		thread: thread === true,
	};
}
