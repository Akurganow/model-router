/// <reference types="node" />
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { noul } from "@typesafe-ai/sdk";
import { createClient } from "./client.ts";

const KEY = "test-key";
const MODEL = "jev-test";
const ENV_NAMES = [
	"TYPESAFE_BASE_URL",
	"TYPESAFE_LOG_LEVEL",
	"TYPESAFE_DEFAULT_MODEL",
] as const;

type Seen = { url: string; headers: Headers; body: string };

function stubFetch() {
	const seen: Seen[] = [];
	const fetchFn = async (url: string, init?: RequestInit) => {
		seen.push({
			url,
			headers: new Headers(init?.headers),
			body: String(init?.body),
		});
		const bytes = new TextEncoder().encode(
			JSON.stringify({ answers: { q: { noul: 0.5 } } }),
		);
		const body = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(bytes);
				controller.close();
			},
		});
		return new Response(body, {
			headers: { "content-type": "application/json" },
		});
	};
	return { seen, fetchFn };
}

const state = { role: "r", description: "d", task: "t" };
const questions = { q: noul("Is it?") };

const saved = new Map<string, string | undefined>();
beforeEach(() => {
	for (const name of ENV_NAMES) saved.set(name, process.env[name]);
});
afterEach(() => {
	for (const name of ENV_NAMES) {
		const value = saved.get(name);
		if (value === undefined) delete process.env[name];
		else process.env[name] = value;
	}
});

test("posts plain JSON with the explicit model to the fixed endpoint", async () => {
	const { seen, fetchFn } = stubFetch();
	await createClient(KEY, MODEL, fetchFn).systemOne({ state, questions });
	const [request] = seen;
	assert.equal(seen.length, 1);
	assert.equal(request?.url, "https://api.typesafe.ai/v1/systemone");
	assert.equal(request?.headers.get("authorization"), `Bearer ${KEY}`);
	assert.equal(request?.headers.get("content-encoding"), null);
	assert.equal(JSON.parse(request?.body ?? "").model, MODEL);
});

test("compresses nothing even for a large body", async () => {
	const { seen, fetchFn } = stubFetch();
	const big = { ...state, task: "x".repeat(5000) };
	await createClient(KEY, MODEL, fetchFn).systemOne({ state: big, questions });
	assert.equal(seen[0]?.headers.get("content-encoding"), null);
	assert.equal(JSON.parse(seen[0]?.body ?? "").state.task.length, 5000);
});

test("ignores TYPESAFE_BASE_URL, TYPESAFE_LOG_LEVEL and TYPESAFE_DEFAULT_MODEL", async (t) => {
	Object.assign(process.env, {
		TYPESAFE_BASE_URL: "https://evil.example",
		TYPESAFE_LOG_LEVEL: "debug",
		TYPESAFE_DEFAULT_MODEL: "env-model",
	});
	const logged = t.mock.method(console, "debug", () => undefined);
	const info = t.mock.method(console, "info", () => undefined);
	const { seen, fetchFn } = stubFetch();
	await createClient(KEY, MODEL, fetchFn).systemOne({ state, questions });
	assert.equal(seen[0]?.url, "https://api.typesafe.ai/v1/systemone");
	assert.equal(JSON.parse(seen[0]?.body ?? "").model, MODEL);
	assert.equal(logged.mock.callCount(), 0);
	assert.equal(info.mock.callCount(), 0);
});

test("a request without a model uses the call's model", async () => {
	Object.assign(process.env, { TYPESAFE_DEFAULT_MODEL: "env-model" });
	const { seen, fetchFn } = stubFetch();
	await createClient(KEY, MODEL, fetchFn).systemOne({ state, questions });
	assert.equal(JSON.parse(seen[0]?.body ?? "").model, MODEL);
});

test("sends the SDK identification headers", async () => {
	const { seen, fetchFn } = stubFetch();
	await createClient(KEY, MODEL, fetchFn).systemOne({ state, questions });
	const headers = seen[0]?.headers;
	assert.match(headers?.get("user-agent") ?? "", /^typesafe-sdk\//);
	assert.match(headers?.get("x-typesafe-sdk") ?? "", /^typesafe-sdk\//);
	assert.ok(headers?.get("x-typesafe-runtime"));
});
