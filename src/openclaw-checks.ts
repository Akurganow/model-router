import type { OpenClawConfig, PluginRuntime } from "./openclaw-types.ts";

/**
 * True when OpenClaw resolves the model string the user assigned for this agent and holds a credential for its provider.
 * The runtime answers from its config and stores, so no check makes a request. Any error, false or throw is unresolved.
 */
export async function slotResolves(
	runtime: PluginRuntime,
	cfg: OpenClawConfig,
	agentId: string | undefined,
	slot: string,
): Promise<boolean> {
	try {
		const target = agentId === undefined ? { cfg } : { cfg, agentId };
		const { modelConfig, modelAuth, agent } = runtime;
		const { provider: defaultProvider } =
			modelConfig.resolveDefaultModelForAgent(target);
		const resolved = modelConfig.resolveAllowedModelRef({
			...target,
			catalog: [],
			raw: slot,
			defaultProvider,
		});
		if ("error" in resolved) return false;
		// Only the agent's directory holds its stored profile keys.
		const agentDir =
			agentId === undefined ? undefined : agent.resolveAgentDir(cfg, agentId);
		const credential = {
			provider: resolved.ref.provider,
			cfg,
			...(agentDir ? { agentDir } : {}),
		};
		return (
			(await modelAuth.isProviderApiKeyConfiguredAsync(credential)) === true
		);
	} catch {
		return false;
	}
}
