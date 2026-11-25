/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Attempt } from "#core/providers/provider.ts";
import { endpointOf } from "#core/scoring/makers/registry.ts";

const attemptOf = (maker: string, path: string): Attempt =>
	({ maker, path, holder: "typesafe", key: "test-key" }) as Attempt;

test("endpointOf gives undefined for an inherited name and for an unknown maker or path", () => {
	for (const name of ["toString", "other"]) {
		assert.equal(endpointOf(attemptOf(name, "direct")), undefined, name);
		assert.equal(endpointOf(attemptOf("typesafe", name)), undefined, name);
	}
});

test("endpointOf hands the maker's own module per path", () => {
	const direct = endpointOf(attemptOf("google", "direct"));
	assert.deepEqual(direct?.keyHeader, { name: "x-goog-api-key", prefix: "" });
	assert.equal(
		direct?.url,
		"https://generativelanguage.googleapis.com/v1beta/decisions",
	);
	const gateway = endpointOf(attemptOf("google", "openrouter"));
	assert.deepEqual(gateway?.keyHeader, {
		name: "Authorization",
		prefix: "Bearer ",
	});
	assert.equal(gateway?.url, "https://openrouter.ai/api/alpha/decisions");
});
