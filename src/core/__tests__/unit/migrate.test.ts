/// <reference types="node" />

import assert from "node:assert/strict";
import { test } from "node:test";
import { migrate, SETTINGS_VERSION } from "#core/options/migrate.ts";
import { readModels } from "#core/options/models.ts";

const CHANGE = "models: typesafe from the removed model option";

test("the ladder names its newest step", () => {
	assert.equal(SETTINGS_VERSION, 1);
});

test("a record with no models and no model is left as it is", () => {
	const stored = { provider: "openai", scope: "core" };
	assert.deepEqual(migrate(stored), { stored, changes: [] });
});

test("the removed model becomes the typesafe entry of a silent models, and stays", () => {
	assert.deepEqual(migrate({ model: " jev-preview " }), {
		stored: { model: " jev-preview ", models: "{typesafe:jev-preview}" },
		changes: [CHANGE],
	});
	assert.deepEqual(migrate({ model: "jev-preview", models: "  " }).stored, {
		model: "jev-preview",
		models: "{typesafe:jev-preview}",
	});
});

test("the typesafe entry joins the entries a text already holds, in the order of the makers", () => {
	assert.deepEqual(
		migrate({ model: "jev-preview", models: "openai:gpt-6-luna" }).stored,
		{
			model: "jev-preview",
			models: "{typesafe:jev-preview, openai:gpt-6-luna}",
		},
	);
});

test("a blank model changes nothing", () => {
	for (const model of ["", "   ", 5, null])
		assert.deepEqual(migrate({ model }).changes, [], String(model));
});

test("an object stays an object", () => {
	assert.deepEqual(migrate({ model: "jev-preview", models: { openai: "a" } }), {
		stored: {
			model: "jev-preview",
			models: { openai: "a", typesafe: "jev-preview" },
		},
		changes: [CHANGE],
	});
});

test("a JSON text stays JSON, and a name with a comma stays valid", () => {
	assert.equal(
		migrate({
			model: "jev-preview",
			models: '{"google": "gemini-decision-1"}',
		}).stored.models,
		'{"google":"gemini-decision-1","typesafe":"jev-preview"}',
	);
	const { models } = migrate({
		model: "jev-preview",
		models: '{"openai": "a,b"}',
	}).stored;
	assert.equal(models, '{"openai":"a,b","typesafe":"jev-preview"}');
	assert.deepEqual(readModels(models), {
		models: { openai: "a,b", typesafe: "jev-preview" },
	});
});

test("a model that would not read back as the typesafe entry is not copied", () => {
	for (const model of ["a/b", "a,b", "a, openai:b"])
		assert.deepEqual(migrate({ model }).changes, [], model);
});

test("a models that names typesafe is left as it is", () => {
	const stored = { model: "jev-preview", models: "{typesafe:jev-latest}" };
	assert.deepEqual(migrate(stored), { stored, changes: [] });
});

test("a models that is not valid is left as it is", () => {
	const stored = { model: "jev-preview", models: "{acme:x}" };
	assert.deepEqual(migrate(stored), { stored, changes: [] });
});

test("a second run gives the record of the first", () => {
	for (const stored of [
		{},
		{ model: "jev-preview" },
		{ model: "jev-preview", models: "{openai:gpt-6-luna}" },
		{ model: "jev-preview", models: { openai: "a" } },
		{ model: "jev-preview", models: '{"openai": "a"}' },
		{ model: "jev-preview", models: "{typesafe:jev-latest}" },
		{ model: "jev-preview", models: "{acme:x}" },
	]) {
		const once = migrate(stored);
		const twice = migrate(once.stored);
		assert.deepEqual(twice.stored, once.stored, JSON.stringify(stored));
		assert.deepEqual(twice.changes, [], JSON.stringify(stored));
	}
});
