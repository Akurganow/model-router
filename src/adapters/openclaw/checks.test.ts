import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { slotResolves } from "./checks.ts";
import { createFakeRuntime, type RuntimeMember } from "./fakes.ts";
import type { OpenClawConfig } from "./types.ts";

const CFG: OpenClawConfig = { agents: { entries: { main: {} } } };
const SLOT = "openai/gpt-5-mini";

describe("slotResolves", () => {
	it("resolves for the agent with an empty catalogue and the agent's default provider", async () => {
		const fake = createFakeRuntime({
			defaultModel: { provider: "anthropic", model: "claude" },
		});
		assert.equal(await slotResolves(fake.runtime, CFG, "main", SLOT), true);
		assert.deepEqual(fake.calls.defaultModel, [{ cfg: CFG, agentId: "main" }]);
		assert.deepEqual(fake.calls.allowedRef, [
			{
				cfg: CFG,
				agentId: "main",
				catalog: [],
				raw: SLOT,
				defaultProvider: "anthropic",
			},
		]);
	});

	it("checks the credential of the resolved provider with the agent directory", async () => {
		const fake = createFakeRuntime({ agentDir: "/agents/main" });
		await slotResolves(fake.runtime, CFG, "main", SLOT);
		assert.deepEqual(fake.calls.agentDir, [{ cfg: CFG, agentId: "main" }]);
		assert.deepEqual(fake.calls.credential, [
			{ provider: "openai", cfg: CFG, agentDir: "/agents/main" },
		]);
	});

	it("without an agent id passes none and reads no directory", async () => {
		const fake = createFakeRuntime();
		assert.equal(await slotResolves(fake.runtime, CFG, undefined, SLOT), true);
		assert.deepEqual(fake.calls.defaultModel, [{ cfg: CFG }]);
		assert.deepEqual(fake.calls.allowedRef[0]?.agentId, undefined);
		assert.equal("agentId" in (fake.calls.allowedRef[0] ?? {}), false);
		assert.equal(fake.calls.agentDir.length, 0);
		assert.deepEqual(fake.calls.credential, [{ provider: "openai", cfg: CFG }]);
	});

	it("passes no directory when the runtime returns an empty one", async () => {
		const fake = createFakeRuntime({ agentDir: "" });
		await slotResolves(fake.runtime, CFG, "main", SLOT);
		assert.deepEqual(fake.calls.credential, [{ provider: "openai", cfg: CFG }]);
	});

	it("is unresolved when the resolve returns an error, and never checks the credential", async () => {
		const fake = createFakeRuntime({ resolved: { error: "not allowed" } });
		assert.equal(await slotResolves(fake.runtime, CFG, "main", SLOT), false);
		assert.equal(fake.calls.credential.length, 0);
	});

	it("is unresolved when the credential check reads false", async () => {
		const fake = createFakeRuntime({ credential: false });
		assert.equal(await slotResolves(fake.runtime, CFG, "main", SLOT), false);
	});

	for (const member of [
		"defaultModel",
		"allowedRef",
		"agentDir",
		"credential",
	] as RuntimeMember[])
		it(`is unresolved when ${member} throws`, async () => {
			const fake = createFakeRuntime();
			fake.throwOn.add(member);
			assert.equal(await slotResolves(fake.runtime, CFG, "main", SLOT), false);
		});

	it("is unresolved when the runtime answers something that is not a ref", async () => {
		const fake = createFakeRuntime();
		fake.answers.resolved = {} as never;
		assert.equal(await slotResolves(fake.runtime, CFG, "main", SLOT), false);
	});
});
