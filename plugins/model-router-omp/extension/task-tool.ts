import type { Pi } from "./types.ts";

export type TaskTool = { effortEnabled: boolean; customTaskAgent: boolean };

// The description of omp's bundled `task` agent (prompts/agents/task.md at v18.2.8). A different one
// under the `task` heading means the user's own agent replaced it.
const BUNDLED_TASK_DESCRIPTION =
	"General-purpose subagent with full capabilities for delegated multi-step tasks";
const TASK_HEADING = /^### task(?=[ \t]|$).*\n(.*)$/m;

type JsonObject = {
	properties?: Record<string, JsonObject>;
	items?: JsonObject;
};

// omp builds tool schemas with omptype, whose schemas expose toJsonSchema(); a TypeBox schema is
// already JSON Schema (docs/omptype-guide.md).
function jsonSchemaOf(parameters: unknown): JsonObject {
	const schema = parameters as { toJsonSchema?: () => unknown } | undefined;
	const json =
		typeof schema?.toJsonSchema === "function" ? schema.toJsonSchema() : schema;
	return typeof json === "object" && json !== null ? (json as JsonObject) : {};
}

// omp adds the `effort` field to the task tool only while task.enableEffort is on.
function offersEffort(parameters: unknown): boolean {
	const { properties } = jsonSchemaOf(parameters);
	const item = properties?.["tasks"]?.items?.properties;
	return Boolean(properties?.["effort"] ?? item?.["effort"]);
}

// omp gives extensions no settings API, so the task tool's own schema and description stand in.
export function readTaskTool(pi: Pi): TaskTool {
	try {
		const tool = pi.getAllTools?.().find(({ name }) => name === "task");
		const description = TASK_HEADING.exec(tool?.description ?? "")?.[1];
		return {
			effortEnabled: offersEffort(tool?.parameters),
			customTaskAgent:
				description !== undefined &&
				description.trim() !== BUNDLED_TASK_DESCRIPTION,
		};
	} catch {
		return { effortEnabled: false, customTaskAgent: false };
	}
}
