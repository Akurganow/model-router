import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createFakeClock } from "../../utils/fake-clock.ts";
import { createFakeApi, createJevFetch } from "./fakes.ts";
import { lines, setup } from "./handler-fakes.ts";
import { createPlugin } from "./index.ts";
import { PLUGIN_ID } from "./settings.ts";
import type { OpenClawConfig } from "./types.ts";

const SETTINGS = {
	provider: "typesafe",
	small_model: "openai/small",
	api_key: "typesafe-key",
};
const hooksOf = (timeoutMs: number): OpenClawConfig => ({
	plugins: { entries: { [PLUGIN_ID]: { hooks: { timeoutMs } } } },
});

// Hook timeouts of 2999, 3000 and 3001 ms leave deadlines of 999, 1000 and 1001 ms.
describe("the OpenClaw registration at the deadline floor", () => {
	const load = (timeoutMs: number) => {
		const fake = createFakeApi({
			config: hooksOf(timeoutMs),
			pluginConfig: SETTINGS,
		});
		createPlugin({
			fetchFn: createJevFetch({ tier: 0, work: 1 }).fetch,
			clock: createFakeClock().clock,
			env: {},
		}).register(fake.api);
		return fake;
	};

	it("warns once with the exact text at 2999 ms and still registers the hook", () => {
		const s = load(2999);
		assert.deepEqual(s.logs, [
			{
				level: "warn",
				message:
					"model-router the hook timeout is 2999 ms, which leaves 999 ms to route; the plugin routes nothing. Set it to 3000 ms or more.",
			},
		]);
		assert.equal(s.hooks.length, 1);
		assert.deepEqual(s.hooks[0]?.options, {
			matcher: ["sessions_spawn"],
			priority: 100,
			timeoutMs: 10000,
		});
	});

	for (const timeoutMs of [3000, 3001])
		it(`registers the hook without a warning at ${timeoutMs} ms`, () => {
			const s = load(timeoutMs);
			assert.deepEqual(s.logs, []);
			assert.equal(s.hooks.length, 1);
			assert.deepEqual(s.hooks[0]?.options, {
				matcher: ["sessions_spawn"],
				priority: 100,
				timeoutMs: 10000,
			});
		});
});

describe("the OpenClaw router at the deadline floor", () => {
	it("returns nothing and arms no timer at 999 ms", async () => {
		const s = setup({ deadlineMs: 999 });
		assert.equal(await s.call(), undefined);
		assert.equal(s.jev.requests.length, 0);
		assert.deepEqual(s.time.delays(), []);
		assert.deepEqual(lines(s), []);
	});

	for (const deadlineMs of [1000, 1001])
		it(`routes with a ${deadlineMs} ms timer at ${deadlineMs} ms`, async () => {
			const s = setup({ deadlineMs });
			assert.ok(await s.call());
			assert.deepEqual(s.time.delays(), [deadlineMs]);
		});
});
