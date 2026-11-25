import { migrate } from "#core/options/migrate.ts";
import { isRecord } from "#utils/guards.ts";
import { PLUGIN_ID, pluginEntry } from "./settings.ts";
import type { OpenClawConfig, SetupApi } from "./types.ts";

type Migrated = { config: OpenClawConfig; changes: string[] };

/**
 * Runs the settings ladder on the plugin's own settings in the config and returns the config with
 * the result and the text of each change. A config with nothing to change comes back as it is, so a
 * second run gives the same answer. Never throws on a config of any shape, and never reads the
 * runtime: OpenClaw runs it before the plugin loads.
 */
export function migrateConfig(config: OpenClawConfig): Migrated {
	const entry = pluginEntry(config);
	const settings = entry?.config;
	if (entry === undefined || !isRecord(settings))
		return { config, changes: [] };
	const { stored, changes } = migrate(settings);
	if (changes.length === 0) return { config, changes: [] };
	const plugins = config.plugins ?? {};
	return {
		config: {
			...config,
			plugins: {
				...plugins,
				entries: {
					...plugins.entries,
					[PLUGIN_ID]: { ...entry, config: { ...stored } },
				},
			},
		},
		changes: [...changes],
	};
}

// OpenClaw loads this file in its setup pass, where it imports nothing of the plugin's runtime.
export default {
	id: PLUGIN_ID,
	register: (api: SetupApi): void => api.registerConfigMigration(migrateConfig),
};
