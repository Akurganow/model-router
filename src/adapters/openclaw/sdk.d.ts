// OpenClaw is not installed here. models.ts imports this module only when the
// tool lists the models, and the bundle leaves it external: OpenClaw's plugin
// loader resolves it inside the Gateway. The result is left unknown, so the
// adapter checks its shape. Source: src/plugin-sdk/models-provider-runtime.ts of
// OpenClaw 2026.11.1.
declare module "openclaw/plugin-sdk/models-provider-runtime" {
	export function buildPreparedModelsProviderData(
		cfg: unknown,
		agentId?: string,
	): Promise<unknown>;
}
