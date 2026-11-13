import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

// A glob that matches no file switches a rule off without a sign. This test
// copies the real configuration and plugins beside a small tree, plants one
// fault per rule, runs Biome once, and checks where each fault is reported.

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const BIOME = join(ROOT, "node_modules", ".bin", "biome");
const COMMAND_TIMEOUT_MS = 30_000;

const RESTRICTED = "lint/style/noRestrictedImports";
const PLUGIN = "plugin";

type Fault = {
	form: string;
	file: string;
	// Planted on its own line. `before` is one more line that the fault needs.
	code: string;
	before?: string;
	category: typeof RESTRICTED | typeof PLUGIN;
	message: string;
};

const UTILS = "A utils/ file imports only other utils/ files";
const CORE = "A core/ file imports no adapter";
const ADAPTER = "An adapter imports no other adapter";
const PART = "A part imports no adapter";
const OPENCLAW = "Only models.ts imports from OpenClaw";
const ESBUILD = "The version writer and the check load no esbuild";
const DYNAMIC = "import() takes a string literal";
const REEXPORT = "A utils/ file re-exports nothing";

const faults: Fault[] = [
	{
		form: "utils imports core",
		file: "src/utils/layers.ts",
		code: 'import { a } from "../core/a.ts";',
		category: RESTRICTED,
		message: UTILS,
	},
	{
		form: "utils imports an adapter",
		file: "src/utils/layers.ts",
		code: 'import { b } from "../adapters/omp/b.ts";',
		category: RESTRICTED,
		message: UTILS,
	},
	{
		form: "utils imports a type from core",
		file: "src/utils/layers.ts",
		code: 'import type { C } from "../core/c.ts";',
		category: RESTRICTED,
		message: UTILS,
	},
	{
		form: "utils imports core with a comment inside the braces",
		file: "src/utils/layers.ts",
		code: 'import { /* } from "../utils/x.ts" */ d } from "../core/d.ts";',
		category: RESTRICTED,
		message: UTILS,
	},
	{
		form: "core imports an adapter",
		file: "src/core/layers.ts",
		code: 'import { a } from "../adapters/omp/a.ts";',
		category: RESTRICTED,
		message: CORE,
	},
	{
		form: "tier imports work",
		file: "src/core/tier.ts",
		code: 'import { w } from "./work.ts";',
		category: RESTRICTED,
		message: PART,
	},
	{
		form: "tier imports a client file",
		file: "src/core/tier.ts",
		code: 'import { c } from "./compose.ts";',
		category: RESTRICTED,
		message: PART,
	},
	{
		form: "tier imports an adapter",
		file: "src/core/tier.ts",
		code: 'import { o } from "../adapters/omp/o.ts";',
		category: RESTRICTED,
		message: PART,
	},
	{
		form: "work imports tier",
		file: "src/core/work.ts",
		code: 'import { t } from "./tier.ts";',
		category: RESTRICTED,
		message: PART,
	},
	{
		form: "work imports a client file",
		file: "src/core/work.ts",
		code: 'import { c } from "./client.ts";',
		category: RESTRICTED,
		message: PART,
	},
	{
		form: "claude imports omp",
		file: "src/adapters/claude/layers.ts",
		code: 'import { a } from "../omp/a.ts";',
		category: RESTRICTED,
		message: ADAPTER,
	},
	{
		form: "claude imports openclaw",
		file: "src/adapters/claude/layers.ts",
		code: 'import { b } from "../openclaw/b.ts";',
		category: RESTRICTED,
		message: ADAPTER,
	},
	{
		form: "claude imports hermes",
		file: "src/adapters/claude/layers.ts",
		code: 'import { c } from "../hermes/c.ts";',
		category: RESTRICTED,
		message: ADAPTER,
	},
	{
		form: "omp imports claude",
		file: "src/adapters/omp/layers.ts",
		code: 'import { a } from "../claude/a.ts";',
		category: RESTRICTED,
		message: ADAPTER,
	},
	{
		form: "openclaw imports hermes",
		file: "src/adapters/openclaw/layers.ts",
		code: 'import { a } from "../hermes/a.ts";',
		category: RESTRICTED,
		message: ADAPTER,
	},
	{
		form: "hermes imports openclaw",
		file: "src/adapters/hermes/layers.ts",
		code: 'import { a } from "../openclaw/a.ts";',
		category: RESTRICTED,
		message: ADAPTER,
	},
	{
		form: "the OpenClaw entry imports openclaw",
		file: "src/adapters/openclaw/index.ts",
		code: 'import { a } from "openclaw";',
		category: RESTRICTED,
		message: OPENCLAW,
	},
	{
		form: "the OpenClaw entry imports a path of openclaw",
		file: "src/adapters/openclaw/index.ts",
		code: 'import { b } from "openclaw/plugin-sdk";',
		category: RESTRICTED,
		message: OPENCLAW,
	},
	{
		form: "the OpenClaw entry imports another adapter",
		file: "src/adapters/openclaw/index.ts",
		code: 'import { c } from "../omp/c.ts";',
		category: RESTRICTED,
		message: ADAPTER,
	},
	{
		form: "an OpenClaw file other than models.ts imports openclaw with import()",
		file: "src/adapters/openclaw/config.ts",
		code: 'export const l = () => import("openclaw/plugin-sdk/models-provider-runtime");',
		category: RESTRICTED,
		message: OPENCLAW,
	},
	{
		form: "the OpenClaw models.ts imports another adapter",
		file: "src/adapters/openclaw/models.ts",
		code: 'import { d } from "../hermes/d.ts";',
		category: RESTRICTED,
		message: ADAPTER,
	},
	{
		form: "the version writer imports esbuild",
		file: "scripts/set-version.ts",
		code: 'import { build } from "esbuild";',
		category: RESTRICTED,
		message: ESBUILD,
	},
	{
		form: "the manifest check imports esbuild",
		file: "scripts/manifests.ts",
		code: 'import { build } from "esbuild";',
		category: RESTRICTED,
		message: ESBUILD,
	},
	{
		form: "import() of a variable",
		file: "src/core/dynamic.ts",
		code: "export const a = (path: string) => import(path);",
		category: PLUGIN,
		message: DYNAMIC,
	},
	{
		form: "import() of a template",
		file: "src/core/dynamic.ts",
		code: "export const b = () => import(`./b.ts`);",
		category: PLUGIN,
		message: DYNAMIC,
	},
	{
		form: "import() of a computed string",
		file: "src/adapters/omp/dynamic.ts",
		code: 'export const c = (name: string) => import("./" + name + ".ts");',
		category: PLUGIN,
		message: DYNAMIC,
	},
	{
		form: "import() of a variable with options",
		file: "src/utils/dynamic.ts",
		code: 'export const d = (path: string) => import(path, { with: { type: "json" } });',
		category: PLUGIN,
		message: DYNAMIC,
	},
	{
		form: "utils re-exports names with export … from",
		file: "src/utils/reexports.ts",
		code: 'export { a } from "./a.ts";',
		category: PLUGIN,
		message: REEXPORT,
	},
	{
		form: "utils re-exports types with export … from",
		file: "src/utils/reexports.ts",
		code: 'export type { B } from "./b.ts";',
		category: PLUGIN,
		message: REEXPORT,
	},
	{
		form: "utils re-exports with export * from",
		file: "src/utils/reexports.ts",
		code: 'export * from "./c.ts";',
		category: PLUGIN,
		message: REEXPORT,
	},
	{
		form: "utils re-exports with export * as … from",
		file: "src/utils/reexports.ts",
		code: 'export * as d from "./d.ts";',
		category: PLUGIN,
		message: REEXPORT,
	},
	{
		form: "utils exports a name it imported",
		file: "src/utils/reexports.ts",
		before: 'import { e } from "./e.ts";',
		code: "export { e };",
		category: PLUGIN,
		message: REEXPORT,
	},
	{
		form: "utils exports a name it imported under another name",
		file: "src/utils/reexports.ts",
		before: 'import { f as g } from "./f.ts";',
		code: "export { g };",
		category: PLUGIN,
		message: REEXPORT,
	},
];

// Each file below obeys every rule of its layer, and some quote an import in a
// comment or a string, which a text scan would take for a real one.
const valid: Record<string, string> = {
	"src/utils/valid.ts": [
		'import { a } from "./a.ts";',
		'// import { x } from "../core/x.ts"',
		"const quoted = 'export * from \"./y.ts\"';",
		"const local = 1;",
		"export { local };",
		"export const v = [a, quoted];",
	].join("\n"),
	"src/core/valid.ts": [
		'import { u } from "../utils/u.ts";',
		'import { t } from "./tier.ts";',
		'import { w } from "./work.ts";',
		'import { c } from "./compose.ts";',
		'// import { x } from "../adapters/omp/x.ts"',
		"// import(path)",
		'export const lazy = () => import("./lazy.ts");',
		'export const withOptions = () => import("./a.json", { with: { type: "json" } });',
		'export type Lazy = typeof import("./lazy.ts");',
		"export const v = [u, t, w, c];",
	].join("\n"),
	"src/adapters/claude/valid.ts": [
		'import { c } from "../../core/c.ts";',
		'import { u } from "../../utils/u.ts";',
		'import { s } from "./sibling.ts";',
		"export const v = [c, u, s];",
	].join("\n"),
	"src/adapters/omp/valid.ts": [
		'import { c } from "../../core/c.ts";',
		'import { u } from "../../utils/u.ts";',
		"export const v = [c, u];",
	].join("\n"),
	"src/adapters/openclaw/valid.ts": [
		'import { c } from "../../core/c.ts";',
		"export const v = c;",
	].join("\n"),
	"src/adapters/hermes/valid.ts": [
		'import { c } from "../../core/c.ts";',
		"export const v = c;",
	].join("\n"),
	"src/adapters/drives-several.test.ts": [
		'import { a } from "./omp/a.ts";',
		'import { b } from "./claude/b.ts";',
		"export const v = [a, b];",
	].join("\n"),
	"scripts/valid.ts": [
		'import { build } from "esbuild";',
		"export const load = (path: string) => import(path);",
		"export const v = build;",
	].join("\n"),
};

// Lines that obey the rules, appended to a file that also holds faults. They
// show that a narrow override still allows what its layer allows.
const clean: Record<string, string[]> = {
	"src/core/tier.ts": [
		'import { part } from "./part.ts";',
		"export const t = part;",
	],
	"src/core/work.ts": [
		'import { u } from "../utils/u.ts";',
		"export const w = u;",
	],
	"src/adapters/openclaw/index.ts": [
		'import { c } from "../../core/c.ts";',
		'import { r } from "./router.ts";',
		"export const v = [c, r];",
	],
	"scripts/set-version.ts": [
		'import { readFileSync } from "node:fs";',
		"export const v = readFileSync;",
	],
	"src/adapters/openclaw/models.ts": [
		'import { c } from "../../core/c.ts";',
		'export const list = () => import("openclaw/plugin-sdk/models-provider-runtime");',
		"export const m = c;",
	],
};

type Diagnostic = {
	category: string;
	message: string;
	location: { path: string; start: { line: number } };
};

type Planted = { fault: Fault; line: number };

// The source of each planted file, and the line each fault sits on.
function plant(): { files: Map<string, string[]>; planted: Planted[] } {
	const files = new Map<string, string[]>();
	const planted: Planted[] = [];
	for (const fault of faults) {
		const lines = files.get(fault.file) ?? [];
		if (fault.before !== undefined) lines.push(fault.before);
		lines.push(fault.code);
		files.set(fault.file, lines);
		planted.push({ fault, line: lines.length });
	}
	for (const [file, lines] of Object.entries(clean))
		files.get(file)?.push(...lines);
	return { files, planted };
}

const put = (root: string, path: string, text: string) => {
	mkdirSync(dirname(join(root, path)), { recursive: true });
	writeFileSync(join(root, path), `${text}\n`);
};

describe("the Biome layer rules", () => {
	const { files, planted } = plant();
	let root = "";
	let reported: Diagnostic[] = [];

	before(() => {
		// The tree is not a git checkout, so the copy turns the VCS integration
		// off; Biome stops with an error when it finds no ignore file there.
		root = mkdtempSync(join(tmpdir(), "model-router-lint-"));
		const config = JSON.parse(readFileSync(join(ROOT, "biome.json"), "utf8"));
		config.vcs.enabled = false;
		put(root, "biome.json", JSON.stringify(config));
		for (const name of readdirSync(join(ROOT, "scripts", "lint")))
			put(
				root,
				`scripts/lint/${name}`,
				readFileSync(join(ROOT, "scripts", "lint", name), "utf8"),
			);
		for (const [path, lines] of files) put(root, path, lines.join("\n"));
		for (const [path, text] of Object.entries(valid)) put(root, path, text);
		const run = spawnSync(BIOME, ["lint", "--reporter=json", "."], {
			cwd: root,
			encoding: "utf8",
			timeout: COMMAND_TIMEOUT_MS,
		});
		try {
			reported = JSON.parse(run.stdout).diagnostics;
		} catch {
			assert.fail(`biome printed no report: ${run.stderr}`);
		}
		reported = reported.filter(
			({ category }) => category === RESTRICTED || category === PLUGIN,
		);
	});

	after(() => rmSync(root, { recursive: true, force: true }));

	for (const { fault, line } of planted)
		it(`reports ${fault.form}`, () => {
			const hits = reported.filter(
				({ location }) =>
					location.path === fault.file && location.start.line === line,
			);
			assert.equal(hits.length, 1, `${fault.file}:${line}: ${fault.code}`);
			assert.equal(hits[0]?.category, fault.category);
			assert.ok(hits[0]?.message.startsWith(fault.message), hits[0]?.message);
		});

	for (const path of Object.keys(valid))
		it(`reports nothing in ${path}`, () => {
			assert.deepEqual(
				reported.filter(({ location }) => location.path === path),
				[],
			);
		});

	it("reports only the planted faults", () => {
		const where = ({ location }: Diagnostic) =>
			`${location.path}:${location.start.line}`;
		assert.deepEqual(
			reported.map(where).sort(),
			planted.map(({ fault, line }) => `${fault.file}:${line}`).sort(),
		);
	});
});
