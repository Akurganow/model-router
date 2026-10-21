import assert from "node:assert/strict";
import { test } from "node:test";
import { TransportError } from "./core.ts";
import { type FetchLike, JEV_ENDPOINT, postJev } from "./jev.ts";

type Call = { url: string; init: Parameters<FetchLike>[1] };

const reply = (status: number, text: string) => ({
	ok: status >= 200 && status < 300,
	status,
	text: async () => text,
});

const recording = (response: ReturnType<typeof reply>) => {
	const calls: Call[] = [];
	const fetchFn: FetchLike = async (url, init) => {
		calls.push({ url, init });
		return response;
	};
	return { calls, fetchFn };
};

const failure = async (promise: Promise<string>) =>
	promise.then(
		() => assert.fail("expected a rejection"),
		(err: unknown) => {
			assert.ok(err instanceof TransportError);
			return err;
		},
	);
const failWith = (fetchFn: FetchLike) =>
	failure(postJev(fetchFn, "k", "{}", new AbortController().signal));

test("the request goes to the fixed endpoint, verbatim", async () => {
	const { calls, fetchFn } = recording(reply(200, '{"answers":{}}'));
	const signal = new AbortController().signal;
	const text = await postJev(fetchFn, "key-123", '{"a":1}', signal);
	assert.equal(text, '{"answers":{}}');
	assert.deepEqual(calls, [
		{
			url: "https://api.typesafe.ai/v1/systemone",
			init: {
				method: "POST",
				headers: {
					Authorization: "Bearer key-123",
					"Content-Type": "application/json",
				},
				body: '{"a":1}',
				signal,
				redirect: "error",
			},
		},
	]);
	assert.equal(JEV_ENDPOINT, "https://api.typesafe.ai/v1/systemone");
});

test("a rejected fetch is a network error", async () => {
	const fetchFn: FetchLike = async () => {
		throw new TypeError("fetch failed");
	};
	const err = await failWith(fetchFn);
	assert.equal(err.kind, "network");
	assert.equal(err.message, "network error");
});

test("a fetch that rejects after the abort is a timeout", async () => {
	const stop = new AbortController();
	const fetchFn: FetchLike = async () => {
		stop.abort();
		throw new DOMException("aborted", "AbortError");
	};
	const err = await failure(postJev(fetchFn, "k", "{}", stop.signal));
	assert.equal(err.kind, "timeout");
	assert.equal(err.message, "no answer in 8000 ms");
});

test("a non-2xx answer is an HTTP error with its status", async () => {
	for (const status of [400, 408, 429, 500, 529]) {
		const { fetchFn } = recording(reply(status, "overloaded"));
		const err = await failure(
			postJev(fetchFn, "k", "{}", new AbortController().signal),
		);
		assert.equal(err.kind, "http");
		assert.equal(err.status, status);
		assert.equal(err.message, `HTTP ${status}`);
	}
});

test("a body that fails mid-read is a network error, or a timeout after the abort", async () => {
	const broken = {
		ok: true,
		status: 200,
		text: () => Promise.reject(new Error("reset")),
	};
	const fetchFn: FetchLike = async () => broken;
	const err = await failWith(fetchFn);
	assert.equal(err.kind, "network");
	const stop = new AbortController();
	stop.abort();
	const late = await failure(postJev(fetchFn, "k", "{}", stop.signal));
	assert.equal(late.kind, "timeout");
});
