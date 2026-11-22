/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Attempt } from "#core/providers/provider.ts";
import { endpointOf } from "#core/scoring/endpoints.ts";

const attemptOf = (maker: string, path: string): Attempt =>
	({ maker, path, holder: "typesafe", key: "test-key" }) as Attempt;

test("endpointOf gives undefined for an inherited name and for an unknown maker or path", () => {
	for (const name of ["toString", "other"]) {
		assert.equal(endpointOf(attemptOf(name, "direct")), undefined, name);
		assert.equal(endpointOf(attemptOf("typesafe", name)), undefined, name);
	}
});
