import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createPlugin } from "../src/openclaw.ts";
import { SPAWN_TOOL } from "../src/openclaw-router.ts";
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
const EXPECTED = { name: "@akurganow/model-router", version: VERSION };
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
	assert.deepEqual(inspectProblems(report(), EXPECTED), []);
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
		assert.match(inspectProblems(report(plugin), EXPECTED).join("\n"), pattern);
});

test("the expected package name comes from the caller", () => {
	const expected = { name: "@other/pkg", version: VERSION };
	assert.match(inspectProblems(report(), expected).join("\n"), /packageName/);
});

test("a report without a root directory is a problem", () => {
	for (const rootDir of [undefined, "", "  ", 7])
		assert.match(
			inspectProblems(report({ rootDir }), EXPECTED).join("\n"),
			/rootDir/,
		);
});

test("a diagnostic is a problem", () => {
	const problems = inspectProblems(report({}, [{ message: "boom" }]), EXPECTED);
	assert.match(problems.join("\n"), /diagnostics/);
});

test("something that is not a report is a problem", () => {
	assert.deepEqual(inspectProblems("text", EXPECTED), [
		"the inspect output has no plugin",
	]);
});

test("the shipped bundle registers the hook, the tool and both commands", async () => {
	const { default: plugin } = await import(join(TREE, "index.js"));
	assert.deepEqual(registrationProblems(plugin), []);
});

test("a plugin that registers nothing is reported on every count in both modes", () => {
	const problems = registrationProblems({
		id: "model-router-openclaw",
		register: () => {},
	});
	assert.equal(problems.length, 7);
	assert.match(problems.join("\n"), /full mode: no before_tool_call/);
	assert.match(problems.join("\n"), /discovery mode: no model-router-scope/);
	assert.doesNotMatch(
		problems.join("\n"),
		/discovery mode: no before_tool_call/,
	);
});

test("a plugin that registers its tool and commands only in full mode is reported for discovery", () => {
	const plugin = createPlugin();
	const problems = registrationProblems({
		register: (api: OpenClawApi) => {
			if (api.registrationMode === "full") plugin.register(api);
		},
	});
	assert.deepEqual(problems, [
		"discovery mode: no model_router_config tool registered",
		"discovery mode: no model-router-provider command registered",
		"discovery mode: no model-router-scope command registered",
	]);
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
