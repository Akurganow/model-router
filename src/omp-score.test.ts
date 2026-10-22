import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { streamedFetch } from "./omp-score.ts";

afterEach(() => mock.restoreAll());

test("a reply whose own body is unusable comes back with a readable stream body", async () => {
	const buffered = {
		status: 429,
		statusText: "Too Many Requests",
		headers: new Headers({ "retry-after-ms": "5" }),
		text: async () => '{"error":"slow down"}',
		get body(): never {
			throw new Error("Body already used");
		},
	};
	mock.method(globalThis, "fetch", async () => buffered);
	const reply = await streamedFetch("https://example.test/", {});
	assert.equal(reply.status, 429);
	assert.equal(reply.statusText, "Too Many Requests");
	assert.equal(reply.headers.get("retry-after-ms"), "5");
	assert.ok(reply.body instanceof ReadableStream);
	assert.deepEqual(await reply.clone().json(), { error: "slow down" });
	assert.deepEqual(await reply.json(), { error: "slow down" });
});
