/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Attempt } from "#core/providers/provider.ts";
import { endpointOf } from "#core/scoring/endpoints.ts";

const attemptOf = (provider: string): Attempt =>
	({ provider, model: "jev-latest", key: "test-key" }) as Attempt;

test("endpointOf gives undefined for an inherited name and for an unknown provider", () => {
	for (const provider of ["toString", "other"])
		assert.equal(endpointOf(attemptOf(provider)), undefined, provider);
});
