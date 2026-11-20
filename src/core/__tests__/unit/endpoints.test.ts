/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Attempt } from "../../providers/provider.ts";
import { endpointOf } from "../../scoring/endpoints.ts";
import { SYSTEM_ONE } from "../../scoring/formats/system-one.ts";

const attemptOf = (provider: string): Attempt =>
	({ provider, model: "jev-latest", key: "test-key" }) as Attempt;

test("endpointOf gives each provider its full URL and the System One format", () => {
	assert.deepEqual(endpointOf(attemptOf("typesafe")), {
		url: "https://api.typesafe.ai/v1/systemone",
		format: SYSTEM_ONE,
	});
	assert.deepEqual(endpointOf(attemptOf("openrouter")), {
		url: "https://openrouter.ai/api/v1/systemone",
		format: SYSTEM_ONE,
	});
});

test("endpointOf gives undefined for an inherited name and for an unknown provider", () => {
	for (const provider of ["toString", "other"])
		assert.equal(endpointOf(attemptOf(provider)), undefined, provider);
});
