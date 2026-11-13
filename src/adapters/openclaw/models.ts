/// <reference path="./sdk.d.ts" />
import type { Listed, ModelPort } from "../../core/models.ts";
import { slotSetting } from "../../core/slots.ts";
import { isRecord } from "../../utils/guards.ts";
import { PLUGIN_ID } from "./settings.ts";
import type {
	CatalogEntry,
	ModelsData,
	OpenClawApi,
	OpenClawConfig,
} from "./types.ts";

/** Returns OpenClaw's data for its /models list, for the default agent. */
export type ListModels = (cfg: OpenClawConfig) => Promise<unknown>;

// The import runs only when the tool lists the models. So the bundle loads and
// registers without OpenClaw, as the tests and the install check load it, and a
// failed import becomes the tool's `models unavailable` line.
export const listFromOpenClaw: ListModels = async (cfg) => {
	const { buildPreparedModelsProviderData } = await import(
		"openclaw/plugin-sdk/models-provider-runtime"
	);
	return buildPreparedModelsProviderData(cfg);
};

// OpenClaw's marker for a context size it made up for a model whose config gives none.
const SYNTHETIC = "synthetic";

/**
 * Returns the models the person can run from OpenClaw's /models data: each
 * model the list offers (`byProvider`) that OpenClaw names a runtime for
 * (`runtimeChoicesByModel`). The list also offers a configured model that needs
 * a sign-in, and that one has no runtime. The context size comes from the
 * catalogue row, unless OpenClaw made it up. Throws on data of another shape.
 */
export function runnable(data: unknown): Listed[] {
	const { byProvider, runtimeChoicesByModel, modelCatalog }: ModelsData =
		isRecord(data) ? data : {};
	if (
		!(byProvider instanceof Map) ||
		!(runtimeChoicesByModel instanceof Map) ||
		!Array.isArray(modelCatalog)
	)
		throw new Error("OpenClaw returned model data of an unknown shape");
	const rows: CatalogEntry[] = modelCatalog.filter(isRecord);
	const listed: Listed[] = [];
	for (const [provider, models] of byProvider) {
		if (typeof provider !== "string" || !(models instanceof Set)) continue;
		for (const model of models) {
			if (typeof model !== "string") continue;
			const id = `${provider}/${model}`;
			const choices = runtimeChoicesByModel.get(id);
			if (!Array.isArray(choices) || choices.length === 0) continue;
			const row = rows.find(
				(entry) => entry.provider === provider && entry.id === model,
			);
			const context =
				row?.contextWindowSource === SYNTHETIC ? undefined : row?.contextWindow;
			listed.push(typeof context === "number" ? { id, context } : { id });
		}
	}
	return listed;
}

/**
 * The model port of the config tool. OpenClaw gives a tool no dialog, so it
 * has no writer: the person sets each slot with the text `help` returns.
 */
export const modelPort = (
	api: OpenClawApi,
	listModels: ListModels,
): ModelPort => ({
	list: async () => runnable(await listModels(api.runtime.config.current())),
	help: (slot) =>
		`${slotSetting(slot)} is set on the plugin's settings page in the Control UI, or with: openclaw config set plugins.entries.${PLUGIN_ID}.config.${slotSetting(slot)} <provider/model>`,
	writer: null,
});
