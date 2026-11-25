/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Attempt } from "#core/providers/provider.ts";
import { MAKERS } from "#core/providers/provider.ts";
import { endpointOf, MODULES, modelOf } from "#core/scoring/maker-registry.ts";

const attemptOf = (maker: string, path: string): Attempt =>
	({ maker, path, holder: "typesafe", key: "test-key" }) as Attempt;

test("endpointOf gives undefined for an inherited name and for an unknown maker or path", () => {
	for (const name of ["toString", "other"]) {
		assert.equal(endpointOf(attemptOf(name, "direct")), undefined, name);
		assert.equal(endpointOf(attemptOf("typesafe", name)), undefined, name);
	}
});

test("modelOf gives the default of the path when no name is stored", () => {
	assert.equal(modelOf("typesafe", "direct", undefined), "jev-latest");
	assert.equal(modelOf("typesafe", "openrouter", undefined), "jev-latest");
	assert.equal(modelOf("openai", "direct", undefined), "gpt-6-luna");
	assert.equal(
		modelOf("openai", "openrouter", undefined),
		"openai/gpt-6-luna-decisions",
	);
	assert.equal(modelOf("google", "direct", undefined), "gemini-decision-1");
	assert.equal(
		modelOf("google", "openrouter", undefined),
		"google/gemini-decision-1",
	);
});

test("modelOf gives a stored name as written on the direct path", () => {
	assert.equal(modelOf("typesafe", "direct", "jev-1.14.0"), "jev-1.14.0");
	assert.equal(modelOf("openai", "direct", "gpt-7-sol"), "gpt-7-sol");
	assert.equal(modelOf("openai", "direct", "toString"), "toString");
});

test("modelOf gives the slug of a name in the table on the OpenRouter path", () => {
	assert.equal(modelOf("typesafe", "openrouter", "jev-preview"), "jev-preview");
	assert.equal(
		modelOf("typesafe", "openrouter", "jev-1.14.0"),
		"typesafe/jev-1.14",
	);
	assert.equal(
		modelOf("openai", "openrouter", "gpt-6-luna"),
		"openai/gpt-6-luna-decisions",
	);
	assert.equal(
		modelOf("google", "openrouter", "gemini-decision-1"),
		"google/gemini-decision-1",
	);
});

test("modelOf sends a name outside the table as written on the System One route and with its vendor on a Decisions route", () => {
	assert.equal(modelOf("typesafe", "openrouter", "jev-2"), "jev-2");
	assert.equal(
		modelOf("openai", "openrouter", "gpt-7-sol"),
		"openai/gpt-7-sol",
	);
	assert.equal(
		modelOf("google", "openrouter", "gemini-decision-2"),
		"google/gemini-decision-2",
	);
});

test("modelOf takes an inherited name for a name outside the table", () => {
	assert.equal(modelOf("openai", "openrouter", "toString"), "openai/toString");
	assert.equal(modelOf("typesafe", "openrouter", "constructor"), "constructor");
});

test("endpointOf carries the model that the attempt's stored name translates to", () => {
	const attempt = {
		...attemptOf("openai", "openrouter"),
		storedModel: "gpt-7-sol",
	} as Attempt;
	assert.equal(endpointOf(attempt)?.model, "openai/gpt-7-sol");
	assert.equal(endpointOf(attemptOf("openai", "direct"))?.model, "gpt-6-luna");
});

test("every slug that holds a slash starts with its module's vendor", () => {
	for (const maker of MAKERS) {
		const { vendor, openrouterNames, paths } = MODULES[maker];
		for (const slug of [
			...Object.values(openrouterNames),
			paths.openrouter.model,
		]) {
			if (slug.includes("/"))
				assert.match(slug, new RegExp(`^~?${vendor}/`), `${maker}: ${slug}`);
		}
	}
});

test("every slug on a Decisions route holds a slash", () => {
	for (const maker of MAKERS) {
		const { openrouterRoute, openrouterNames, paths } = MODULES[maker];
		if (openrouterRoute === "decisions")
			for (const slug of [
				...Object.values(openrouterNames),
				paths.openrouter.model,
			])
				assert.ok(slug.includes("/"), `${maker}: ${slug}`);
	}
});

test("the model a module defaults to on the direct path maps to its OpenRouter default", () => {
	for (const maker of MAKERS)
		assert.equal(
			modelOf(maker, "openrouter", MODULES[maker].paths.direct.model),
			modelOf(maker, "openrouter", undefined),
			maker,
		);
});
