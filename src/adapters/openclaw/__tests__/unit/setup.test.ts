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

	it("writes what the ladder changes into the plugin's settings and nothing else", () => {
		const legacy = structuredClone(FIXTURE);
		const entry = legacy.plugins?.entries?.[PLUGIN_ID];
		assert.ok(entry?.config);
		delete entry.config["models"];
		entry.config["model"] = "jev-preview";
		const before = structuredClone(legacy);
		const first = migrateConfig(legacy);
		assert.deepEqual(legacy, before);
		assert.deepEqual(first.changes, [
			"models: typesafe from the removed model option",
		]);
		const migrated = first.config.plugins?.entries?.[PLUGIN_ID];
		assert.deepEqual(migrated?.config, {
			provider: "openai",
			gateway: "auto",
			scope: "extended",
			small_model: "prov/small",
			model: "jev-preview",
			models: "{typesafe:jev-preview}",
		});
		assert.deepEqual(migrated?.hooks, { timeoutMs: 9000 });
		assert.deepEqual(first.config.plugins?.entries?.["other"], {
			config: { model: "keep-me" },
		});
		assert.deepEqual(first.config.agents, FIXTURE.agents);
		assert.deepEqual(migrateConfig(first.config), {
			config: first.config,
			changes: [],
		});
	});
});
