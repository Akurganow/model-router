import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { COMMAND_NAMES, TOOL_NAME } from "../src/openclaw-config.ts";
import { SPAWN_TOOL } from "../src/openclaw-router.ts";
import { PLUGIN_ID } from "../src/openclaw-settings.ts";
import type { OpenClawApi } from "../src/openclaw-types.ts";
import {
	inspectProblems,
	main,
	registrationProblems,
} from "./check-openclaw-install.ts";
import { EXIT_USAGE } from "./exit-codes.ts";
import { useTempRoot } from "./temp-root.ts";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const TREE = join(ROOT, "packages", "model-router");
const VERSION = "1.2.3";
const report = (plugin: object = {}, diagnostics: unknown[] = []) => ({
	plugin: {
		id: "model-router-openclaw",
		packageName: "@akurganow/model-router",
		version: VERSION,
		status: "loaded",
		imported: true,
		enabled: true,
		contracts: { tools: ["model_router_config"] },
		rootDir: TREE,
		...plugin,
	},
	diagnostics,
});

test("a loaded report of the expected package has no problems", () => {
	assert.deepEqual(inspectProblems(report(), VERSION), []);
});

test("each wrong field names itself", () => {
	const cases: [object, RegExp][] = [
		[{ status: "error" }, /status/],
		[{ imported: false }, /imported/],
		[{ enabled: false }, /enabled/],
		[{ version: "0.0.1" }, /version/],
		[{ packageName: "other" }, /packageName/],
		[{ contracts: { tools: [] } }, /model_router_config/],
	];
	for (const [plugin, pattern] of cases)
		assert.match(inspectProblems(report(plugin), VERSION).join("\n"), pattern);
});

test("a diagnostic is a problem", () => {
	const problems = inspectProblems(report({}, [{ message: "boom" }]), VERSION);
	assert.match(problems.join("\n"), /diagnostics/);
});

test("something that is not a report is a problem", () => {
	assert.deepEqual(inspectProblems("text", VERSION), [
		"the inspect output has no plugin",
	]);
});

test("the shipped bundle registers the hook, the tool and both commands", async () => {
	const { default: plugin } = await import(join(TREE, "index.js"));
	assert.deepEqual(registrationProblems(plugin), []);
});

test("a plugin registering the names that src defines has no problems", () => {
	const problems = registrationProblems({
		register: (api: OpenClawApi) => {
			api.on("before_tool_call", async () => undefined, {
				matcher: [SPAWN_TOOL],
			});
			api.registerTool({
				name: TOOL_NAME,
				label: "l",
				description: "d",
				parameters: {},
				execute: async () => ({ content: [] }),
			});
			for (const name of COMMAND_NAMES)
				api.registerCommand({
					name,
					description: "d",
					handler: () => ({}),
				});
		},
	});
	assert.deepEqual(problems, []);
});

test("the bundle registers into a full-mode api with a runtime, as a Gateway gives", () => {
	const seen: unknown[] = [];
	const problems = registrationProblems({
		register: (api: OpenClawApi) => {
			seen.push(api.id, api.registrationMode, api.runtime.config.current());
		},
	});
	assert.deepEqual(seen, [PLUGIN_ID, "full", {}]);
	assert.equal(problems.length, 4);
});

test("a plugin that registers nothing is reported on every count", () => {
	const problems = registrationProblems({
		id: "model-router-openclaw",
		register: () => {},
	});
	assert.equal(problems.length, 4);
	assert.match(problems.join("\n"), /before_tool_call/);
	assert.match(problems.join("\n"), /model-router-scope/);
});

test("a hook without options does not match the spawn tool", () => {
	const problems = registrationProblems({
		register: (api: OpenClawApi) => {
			api.on("before_tool_call", async () => undefined);
		},
	});
	assert.match(problems.join("\n"), new RegExp(`does not match ${SPAWN_TOOL}`));
});

test("a plugin without a register function is a problem", () => {
	assert.match(registrationProblems({ id: "x" }).join("\n"), /register/);
});

test("a register that throws is a problem", () => {
	const problems = registrationProblems({
		id: "model-router-openclaw",
		register: () => {
			throw new Error("boom");
		},
	});
	assert.match(problems.join("\n"), /boom/);
});

const out = useTempRoot("openclaw-inspect-");
const run = async (text: string) => {
	out.put("inspect.json", text);
	return main([join(out.root, "inspect.json")], ROOT);
};

test("main passes on a report whose package registers everything", async () => {
	const { version } = JSON.parse(
		readFileSync(join(TREE, "package.json"), "utf8"),
	);
	assert.equal(await run(JSON.stringify(report({ version }))), 0);
});

test("main fails on a report with the wrong version", async () => {
	assert.equal(await run(JSON.stringify(report())), 1);
});

test("main fails on text that is not JSON", async () => {
	assert.equal(await run("not json"), 1);
});

test("main fails with the usage code when no file is given", async () => {
	assert.equal(await main([], ROOT), EXIT_USAGE);
});
