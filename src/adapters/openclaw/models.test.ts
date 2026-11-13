import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createFakeApi, createFakeRuntime } from "./fakes.ts";
import { modelPort, runnable } from "./models.ts";
import { PLUGIN_ID } from "./settings.ts";
import type { OpenClawConfig } from "./types.ts";

const OPENCLAW = [{ id: "openclaw" }];

// The shape buildPreparedModelsProviderData returned in the runs that docs/clients.md records.
const data = (overrides: Record<string, unknown> = {}) => ({
	byProvider: new Map([
		["stub", new Set(["small-a", "plain-c"])],
		["local", new Set(["local-e"])],
	]),
	modelCatalog: [
		{ id: "small-a", provider: "stub", contextWindow: 128000 },
		{
			id: "plain-c",
			provider: "stub",
			contextWindow: 128000,
			contextWindowSource: "synthetic",
		},
		{ id: "local-e", provider: "local" },
	],
	runtimeChoicesByModel: new Map([
		["stub/small-a", OPENCLAW],
		["stub/plain-c", OPENCLAW],
		["local/local-e", OPENCLAW],
	]),
	...overrides,
});

describe("runnable", () => {
	it("lists provider/model ids, with the context size only where OpenClaw knows it", () => {
		assert.deepEqual(runnable(data()), [
			{ id: "stub/small-a", context: 128000 },
			{ id: "stub/plain-c" },
			{ id: "local/local-e" },
		]);
	});

	it("leaves out a catalogue model that the /models list does not offer", () => {
		const catalog = [
			...data().modelCatalog,
			{ id: "big-x", provider: "anthropic", contextWindow: 200000 },
		];
		assert.deepEqual(
			runnable(data({ modelCatalog: catalog })).map((model) => model.id),
			["stub/small-a", "stub/plain-c", "local/local-e"],
		);
	});

	it("leaves out an offered model that no runtime can run", () => {
		const offered = new Map([
			["stub", new Set(["small-a"])],
			["nokey", new Set(["orphan-d", "orphan-e"])],
		]);
		const runtimes = new Map([
			["stub/small-a", OPENCLAW],
			["nokey/orphan-e", []],
		]);
		assert.deepEqual(
			runnable(
				data({ byProvider: offered, runtimeChoicesByModel: runtimes }),
			).map((model) => model.id),
			["stub/small-a"],
		);
	});

	it("lists an offered model with no catalogue row, without a context size", () => {
		assert.deepEqual(runnable(data({ modelCatalog: [] })), [
			{ id: "stub/small-a" },
			{ id: "stub/plain-c" },
			{ id: "local/local-e" },
		]);
	});

	it("drops a context size that is not a number", () => {
		const catalog = [{ id: "small-a", provider: "stub", contextWindow: "1M" }];
		assert.deepEqual(runnable(data({ modelCatalog: catalog }))[0], {
			id: "stub/small-a",
		});
	});

	it("throws on data of another shape", () => {
		for (const bad of [
			undefined,
			"models",
			{},
			data({ byProvider: {} }),
			data({ runtimeChoicesByModel: [] }),
			data({ modelCatalog: new Map() }),
		])
			assert.throws(() => runnable(bad), {
				message: "OpenClaw returned model data of an unknown shape",
			});
	});
});

describe("modelPort", () => {
	it("lists from the live config and has no writer", async () => {
		const config: OpenClawConfig = { agents: { entries: { main: {} } } };
		const fake = createFakeApi({ config });
		const seen: OpenClawConfig[] = [];
		const port = modelPort(fake.api, async (cfg) => {
			seen.push(cfg);
			return data();
		});
		assert.deepEqual((await port.list()).length, 3);
		assert.deepEqual(seen, [config]);
		assert.equal(port.writer, null);
	});

	it("lists every offered model with a runtime and runs no slot check", async () => {
		const fake = createFakeRuntime({ credential: false });
		const port = modelPort(createFakeApi({ runtime: fake }).api, async () =>
			data(),
		);
		assert.deepEqual(await port.list(), [
			{ id: "stub/small-a", context: 128000 },
			{ id: "stub/plain-c" },
			{ id: "local/local-e" },
		]);
		assert.deepEqual(fake.calls.allowedRef, []);
		assert.deepEqual(fake.calls.credential, []);
	});

	it("rejects when the lister rejects", async () => {
		const port = modelPort(createFakeApi().api, async () => {
			throw new Error("no catalogue owner");
		});
		await assert.rejects(port.list(), { message: "no catalogue owner" });
	});

	it("tells how the person sets each slot", () => {
		const port = modelPort(createFakeApi().api, async () => data());
		assert.equal(
			port.help("middle"),
			`middle_model is set on the plugin's settings page in the Control UI, or with: openclaw config set plugins.entries.${PLUGIN_ID}.config.middle_model <provider/model>`,
		);
	});
});
