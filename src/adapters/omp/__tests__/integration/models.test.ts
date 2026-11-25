import assert from "node:assert/strict";
import { test } from "node:test";
import {
	lockfileWith,
	scoringReply,
	systemOneAnswer,
	useWorld,
} from "#adapters/omp/__tests__/support/fakes.ts";
import { createExtension } from "#adapters/omp/router.ts";
import { OPENAI_REPLY } from "#core/__tests__/support/replies.ts";

const world = useWorld();
const install = () => createExtension(world.imports)(world.pi);
const lines = (...parts: string[]) => parts.join("\n");
const MODELS = "{typesafe:jev-preview, openai:gpt-7-sol}";
const NOT_VALID = "model-router task 1: skipped, models not valid: run setup";
const PREVIEW_LINES = lines(
	"models: {typesafe:jev-preview}",
	"typesafe model: jev-preview (OpenRouter: jev-preview)",
	"openai model: gpt-6-luna (OpenRouter: openai/gpt-6-luna-decisions)",
	"google model: gemini-decision-1 (OpenRouter: google/gemini-decision-1)",
);

// The fake serves the OpenAI reply on OpenAI's address and the System One reply elsewhere.
const answerByUrl = async ({ url }: { url: string }) =>
	url.includes("openai.com")
		? scoringReply(200, JSON.parse(OPENAI_REPLY))
		: scoringReply(200, systemOneAnswer(1, 1));

const sentModels = () =>
	world.sent.map(({ body }) => (body as { model: string }).model);

test("switching the provider switches the model that scores the call", async () => {
	install();
	world.answer = answerByUrl;
	world.credential = async () => "any-key";
	const sentFor = async (provider: string) => {
		world.lockfile = lockfileWith({ provider, models: MODELS });
		world.sent.length = 0;
		await world.toolCall("c", { tasks: [{ task: "a" }] });
		return sentModels();
	};
	assert.deepEqual(await sentFor("typesafe"), ["jev-preview"]);
	assert.deepEqual(await sentFor("openai"), ["gpt-7-sol"]);
	assert.deepEqual(await sentFor("typesafe"), ["jev-preview"]);
});

test("a models text of nothing routes with the defaults", async () => {
	install();
	for (const models of ["", "   ", null]) {
		world.lockfile = lockfileWith({ models });
		world.sent.length = 0;
		await world.toolCall("c", { tasks: [{ task: "a" }] });
		assert.deepEqual(sentModels(), ["jev-latest"], String(models));
	}
});

test("a project's models never applies", async () => {
	install();
	world.lockfile = lockfileWith({ models: "{typesafe:jev-preview}" });
	world.project = { models: "{typesafe:jev-1.14.0}" };
	await world.toolCall("c", { tasks: [{ task: "a" }] });
	assert.deepEqual(sentModels(), ["jev-preview"]);
});

const NOT_VALID_CASES: readonly [
	name: string,
	stored: string,
	shown: string,
][] = [
	["an unknown provider", "{acme:x}", "acme:x"],
	["an empty model", "typesafe:", "typesafe:"],
	["an entry without a colon", "typesafe", "typesafe"],
	["a provider named twice", "typesafe:a, typesafe:b", "typesafe:b"],
	["a model with a slash", "openai:vendor/gpt", "openai:vendor/gpt"],
	["a JSON value that is not a string", '{"typesafe": 5}', "typesafe"],
	["a text of neither form", "{typesafe:a", "{typesafe:a"],
];

for (const [name, stored, shown] of NOT_VALID_CASES)
	test(`${name} skips the call and the tool names the entry`, async () => {
		install();
		world.lockfile = lockfileWith({ models: stored });
		await world.toolCall("c", { tasks: [{ task: "a" }] });
		assert.deepEqual(world.notes, [NOT_VALID]);
		assert.equal(world.sent.length, 0);
		assert.equal(
			await world.callTool({}),
			lines(
				"provider: typesafe",
				"gateway: direct",
				"scope: core",
				`models: ${stored} (not valid: ${shown})`,
			),
		);
	});

test("the tool prints the models lines", async () => {
	install();
	world.lockfile = lockfileWith({ models: "{typesafe:jev-preview}" });
	const report = await world.callTool({});
	assert.equal(report.includes(`\n${PREVIEW_LINES}\n`), true, report);
});

test("the tool writes a models text at once, with no dialog and no UI", async () => {
	install();
	world.hasUI = false;
	assert.equal(
		await world.callTool({ models: "{typesafe:jev-preview}" }),
		PREVIEW_LINES,
	);
	assert.deepEqual(world.writes, [
		{
			plugin: "model-router-omp",
			key: "models",
			value: "{typesafe:jev-preview}",
		},
	]);
	assert.equal(world.dialogs.length, 0);
});

test("a models write replaces the global text even under a project value", async () => {
	install();
	world.project = { models: "{typesafe:jev-1.14.0}" };
	await world.callTool({ models: "{typesafe:jev-preview}" });
	assert.deepEqual(world.writes, [
		{
			plugin: "model-router-omp",
			key: "models",
			value: "{typesafe:jev-preview}",
		},
	]);
});

test("the text that is already stored is not written again", async () => {
	install();
	world.lockfile = lockfileWith({ models: "{typesafe:jev-preview}" });
	assert.equal(
		await world.callTool({ models: "{typesafe:jev-preview}" }),
		"models unchanged: already {typesafe:jev-preview}",
	);
	assert.equal(world.writes.length, 0);
});

test("a text that is not valid is refused with its line and writes nothing", async () => {
	install();
	assert.equal(
		await world.callTool({ models: "{acme:x}" }),
		"models unchanged: not valid: acme:x",
	);
	assert.equal(world.writes.length, 0);
});

test("a failed models write says why", async () => {
	createExtension({
		...world.imports,
		writeSetting: async () => {
			throw new Error("disk full");
		},
	})(world.pi);
	assert.equal(
		await world.callTool({ models: "{typesafe:jev-preview}" }),
		"models unchanged: disk full",
	);
});

test("unreadable settings leave the models text unwritten", async () => {
	install();
	world.lockfile = "not json";
	assert.equal(
		await world.callTool({ models: "{typesafe:jev-preview}" }),
		"models unchanged: settings unreadable",
	);
	assert.equal(world.writes.length, 0);
});

test("a call with both a setting and models, or models that is no text, is a bad call", async () => {
	install();
	const bad = "Pass setting alone, or models as a text alone.";
	assert.equal(
		await world.callTool({ setting: "scope", models: "{typesafe:a}" }),
		bad,
	);
	assert.equal(await world.callTool({ models: 5 }), bad);
	assert.equal(world.writes.length, 0);
	assert.equal(world.dialogs.length, 0);
});
