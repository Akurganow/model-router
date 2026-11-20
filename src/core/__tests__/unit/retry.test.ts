import assert from "node:assert/strict";
import { test } from "node:test";
import { retryDelayMs } from "#core/scoring/transport/retry.ts";

const reader = (values: Record<string, string>) => ({
	get: (name: string): string | null => values[name] ?? null,
});

// 500 is the first backoff with `Math.random` at 0, so it shows that no header set the wait.
const UNUSABLE_HEADERS: ReadonlyArray<{
	name: string;
	headers: Record<string, string>;
	expected: number;
}> = [
	{
		name: "empty retry-after-ms",
		headers: { "retry-after-ms": "" },
		expected: 500,
	},
	{
		name: "spaces in retry-after-ms",
		headers: { "retry-after-ms": "   " },
		expected: 500,
	},
	{ name: "empty retry-after", headers: { "retry-after": "" }, expected: 500 },
	{
		name: "spaces in retry-after",
		headers: { "retry-after": "   " },
		expected: 500,
	},
	{
		name: "empty retry-after-ms before retry-after: 2",
		headers: { "retry-after-ms": "", "retry-after": "2" },
		expected: 2000,
	},
	{
		name: "two retry-after values joined",
		headers: { "retry-after": "2, 3" },
		expected: 500,
	},
];

for (const row of UNUSABLE_HEADERS) {
	test(`a blank or unusable header counts as absent: ${row.name}`, (t) => {
		t.mock.method(Math, "random", () => 0);
		assert.equal(retryDelayMs(0, reader(row.headers)), row.expected);
	});
}
