import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PLUGIN_ID } from "#adapters/openclaw/settings.ts";
import setup, { migrateConfig } from "#adapters/openclaw/setup.ts";
import type {
	ConfigMigration,
	OpenClawConfig,
} from "#adapters/openclaw/types.ts";

const FIXTURE: OpenClawConfig = {
	agents: { defaults: { subagents: { model: "prov/small" } } },
	plugins: {
		entries: {
			other: { config: { model: "keep-me" } },
			[PLUGIN_ID]: {
				hooks: { timeoutMs: 9000 },
				config: {
					provider: "openai",
					gateway: "auto",
					scope: "extended",
					models: "{openai:gpt-7-sol}",
					small_model: "prov/small",
				},
			},
		},
	},
};

describe("the setup entry", () => {
	it("is a plain object with the plugin id and a register that adds one migration", () => {
		const registered: ConfigMigration[] = [];
		const api = new Proxy(
			{ registerConfigMigration: (m: ConfigMigration) => registered.push(m) },
			{
				get: (target, name) => {
					if (name in target) return Reflect.get(target, name);
					throw new Error(`the setup entry used api.${String(name)}`);
				},
			},
		);
		assert.equal(setup.id, PLUGIN_ID);
		setup.register(api);
		assert.deepEqual(registered, [migrateConfig]);
	});
});

describe("the config migration", () => {
	it("returns a config with nothing to change as it is, with no changes", () => {
		const before = structuredClone(FIXTURE);
		const first = migrateConfig(FIXTURE);
		assert.deepEqual(first, { config: before, changes: [] });
		assert.equal(first.config, FIXTURE);
		assert.deepEqual(FIXTURE, before);
		assert.deepEqual(migrateConfig(first.config), first);
	});

	it("leaves a config without the plugin entry or its settings as it is", () => {
		for (const config of [
			{},
			{ plugins: {} },
			{ plugins: { entries: { other: {} } } },
			{ plugins: { entries: { [PLUGIN_ID]: { hooks: {} } } } },
			{ plugins: { entries: { [PLUGIN_ID]: { config: "text" } } } },
		] as unknown as OpenClawConfig[]) {
			assert.deepEqual(migrateConfig(config), { config, changes: [] });
			assert.equal(migrateConfig(config).config, config);
		}
	});
});
