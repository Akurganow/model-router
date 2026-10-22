import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { afterEach, mock, test } from "node:test";
import { type Case, caseHead, main, readKey, runCase } from "./calibrate.ts";

const CASE: Case = {
	role: "coder",
	description: "Fix it",
	text: "Fix the bug. Authorization: Bearer abc.def.ghi",
	expected: 2,
	work: 1,
};
const score = (a: number, b: number, c: number) => ({
	type: "score",
	probabilities: { 0: a, 1: b, 2: c },
});
const REPLY = {
	model: "jev-1.14.0",
	answers: { tier: score(0.1, 0.2, 0.7), work: score(0.1, 0.8, 0.1) },
};

test("runCase sends the brief through the client and returns the decision", async () => {
	const seen: { url: string; body: string; signal: unknown }[] = [];
	const fetchFn = async (url: string, init: RequestInit = {}) => {
		seen.push({ url, body: String(init.body), signal: init.signal });
		return new Response(JSON.stringify(REPLY), {
			headers: { "content-type": "application/json" },
		});
	};
	const d = await runCase(CASE, "jev-latest", "test-key", fetchFn);
	assert.ok(!("skipped" in d));
	const { tier, work } = d.parts;
	assert.equal(tier?.level, 2);
	assert.equal(work?.level, 1);
	assert.equal(d.model, "jev-1.14.0");
	assert.equal(seen.length, 1);
	assert.match(
		seen[0]?.url ?? "",
		/^https:\/\/api\.typesafe\.ai\/v1\/systemone/,
	);
	assert.ok(!seen[0]?.body.includes("abc.def.ghi"), "the brief is redacted");
	assert.ok(seen[0]?.signal instanceof AbortSignal);
});

test("the printed head of a case is redacted like the request", () => {
	const head = caseHead("Bearer abc.def-123 then\nthe task");
	assert.equal(head, "Bearer *** then the task");
});

const replying = async () =>
	new Response(JSON.stringify(REPLY), {
		headers: { "content-type": "application/json" },
	});
const piped = (text: string) =>
	Readable.from([text], { encoding: "utf8" }) as unknown as NodeJS.ReadStream;

function typing(...chunks: string[]) {
	const stdin = Object.assign(new EventEmitter(), {
		isTTY: true,
		raw: [] as boolean[],
		setEncoding() {},
		setRawMode(on: boolean) {
			stdin.raw.push(on);
		},
		resume() {},
		pause() {},
	});
	const key = readKey(stdin as unknown as NodeJS.ReadStream);
	for (const chunk of chunks) stdin.emit("data", chunk);
	return { key, stdin };
}

function recorded() {
	const out: string[] = [];
	const record = (text: unknown) => void out.push(`${text}`);
	mock.method(console, "log", record);
	mock.method(console, "error", record);
	mock.method(process.stderr, "write", record);
	return out;
}

afterEach(() => mock.restoreAll());

test("a key piped on stdin is read and trimmed", async () => {
	assert.equal(await readKey(piped("  secret-key\n")), "secret-key");
});

test("a typed key ends at enter, and backspace removes a character", async () => {
	const out = recorded();
	const { key, stdin } = typing("abx", "\x7f", "c\r");
	assert.equal(await key, "abc");
	assert.deepEqual(stdin.raw, [true, false]);
	assert.match(out.join(""), /TypeSafe API key: /);
});

test("ctrl-c stops with the interrupted exit code", () => {
	recorded();
	const exit = mock.method(process, "exit", (code: number) => {
		throw new Error(`exit ${code}`);
	});
	assert.throws(() => typing("\x03"), /exit 130/);
	assert.equal(exit.mock.callCount(), 1);
});

test("main without a key prints the usage and exits 2 before any request", async () => {
	const out = recorded();
	let requests = 0;
	const fetchFn = async () => {
		requests++;
		return replying();
	};
	assert.equal(await main("jev-latest", piped(""), fetchFn), 2);
	assert.match(out.join("\n"), /usage: node scripts\/calibrate\.ts/);
	assert.equal(requests, 0);
});

test("main reports each miss with its probability and fails below the bar", async () => {
	const out = recorded();
	const code = await main("jev-latest", piped("test-key\n"), replying);
	assert.equal(code, 1);
	const text = out.join("\n");
	assert.match(text, /miss tier {2}expected 0 {2}got 2 {2}p=0\.70 {2}/);
	assert.match(text, /tier agreement 24% \(5\/21\), bar 85%/);
	assert.match(text, /jev-latest answered as jev-1\.14\.0/);
});

test("main prints a case whose reply lacks a part as skipped", async () => {
	const out = recorded();
	const noWork = { model: "m", answers: { tier: REPLY.answers.tier } };
	const fetchFn = async () =>
		new Response(JSON.stringify(noWork), {
			headers: { "content-type": "application/json" },
		});
	assert.equal(await main("jev-latest", piped("test-key"), fetchFn), 1);
	assert.match(out.join("\n"), /^skip /m);
});
