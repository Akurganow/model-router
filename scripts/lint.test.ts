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
const PROCESS_ENV = "lint/style/noProcessEnv";
const GLOBALS = "lint/style/noRestrictedGlobals";
const PLUGIN = "plugin";
const NODE_PROTOCOL = "lint/style/useNodejsImportProtocol";

type Fault = {
	form: string;
	file: string;
	// Planted on its own line. `before` is one more line that the fault needs.
	code: string;
	before?: string;
	category:
		| typeof RESTRICTED
		| typeof PROCESS_ENV
		| typeof GLOBALS
		| typeof PLUGIN
		| typeof NODE_PROTOCOL;
	message: string;
};

const UTILS = "A utils/ file imports only other utils/ files";
const CORE = "A core/ file imports no adapter";
const ADAPTER = "An adapter imports no other adapter";
const PARTS = "A parts/ file imports only ./part.ts and utils/";
const PROVIDERS = "A providers/ file imports nothing from scoring/";
const OUTPUT = "An output/ file imports nothing from scoring/ or decision/";
const SCORING = "A scoring/ file imports nothing from decision/ or options/";
const FORMAT =
	"A wire format imports only its own folder, scoring/failure.ts, scoring/reply.ts, parts/part.ts, brief/brief.ts and utils/";
const ROUTE =
	"route.ts imports no wire format, nothing from transport/, nothing from makers/ and neither maker-registry.ts nor maker-module.ts";
const MAKER_MODULE = "A file of makers/ imports no other file of makers/";
const MAKERS_OUTSIDE = "Only scoring/maker-registry.ts imports from makers/";
const TESTS_IMPORT = "A source file imports nothing from a __tests__ folder";
const ENTRY_OPENCLAW = "The bundle entry imports nothing from OpenClaw";
const ENTRY_ADAPTER = "The bundle entry imports no other adapter";
const ESBUILD = "The version writer and the check load no esbuild";
const DYNAMIC = "import() takes a string literal";
const REEXPORT = "A utils/ file re-exports nothing";
const SHARED_REASON = "This text is a shared skip reason";
const CORE_NODE = "A core/ file imports no Node module";
const CORE_TIMEOUT =
	"The core sets no timer of its own, and AbortSignal.timeout is one";
const SRC_OUTSIDE = "A src/ file imports nothing from scripts/";
const PARENT = "A specifier holds no ../";
const PROCESS_ENV_MESSAGE = "Don't use process.env";
// The JSON report keeps the rule's own sentence and drops the configured message.
// One planted name serves the rule: it shows that the override reaches a source file of
// src/core/. The name is `fetch`, which the type check accepts there, so only this rule stops it.
const FETCH_GLOBAL = "Do not use the global variable fetch";
const NODE_PROTOCOL_MESSAGE =
	"A Node.js builtin module should be imported with the node: protocol";

const faults: Fault[] = [
	{
		form: "utils imports core",
		file: "src/utils/layers.ts",
		code: 'import { a } from "#core/a.ts";',
		category: RESTRICTED,
		message: UTILS,
	},
	{
		form: "utils imports an adapter",
		file: "src/utils/layers.ts",
		code: 'import { b } from "#adapters/omp/b.ts";',
		category: RESTRICTED,
		message: UTILS,
	},
	{
		form: "utils imports a type from core",
		file: "src/utils/layers.ts",
		code: 'import type { C } from "#core/c.ts";',
		category: RESTRICTED,
		message: UTILS,
	},
	{
		form: "utils imports core with a comment inside the braces",
		file: "src/utils/layers.ts",
		code: 'import { /* } from "#utils/x.ts" */ d } from "#core/d.ts";',
		category: RESTRICTED,
		message: UTILS,
	},
	{
		form: "core imports an adapter",
		file: "src/core/brief/layers.ts",
		code: 'import { a } from "#adapters/omp/a.ts";',
		category: PLUGIN,
		message: CORE,
	},
	{
		form: "a part imports the other part, work, with ./",
		file: "src/core/parts/consumer.ts",
		code: 'import { w } from "./work.ts";',
		category: RESTRICTED,
		message: PARTS,
	},
	{
		form: "a part imports another core folder through an alias",
		file: "src/core/parts/consumer.ts",
		code: 'import { ladder } from "#core/decision/ladder.ts";',
		category: RESTRICTED,
		message: PARTS,
	},
	{
		form: "providers import scoring",
		file: "src/core/providers/layers.ts",
		code: 'import { ask } from "#core/scoring/ask.ts";',
		category: RESTRICTED,
		message: PROVIDERS,
	},
	{
		form: "output imports scoring",
		file: "src/core/output/layers.ts",
		code: 'import { ask } from "#core/scoring/ask.ts";',
		category: RESTRICTED,
		message: OUTPUT,
	},
	{
		form: "output imports decision",
		file: "src/core/output/layers.ts",
		code: 'import { decide } from "#core/decision/decide.ts";',
		category: RESTRICTED,
		message: OUTPUT,
	},
	{
		form: "scoring imports decision",
		file: "src/core/scoring/layers.ts",
		code: 'import { ladder } from "#core/decision/ladder.ts";',
		category: RESTRICTED,
		message: SCORING,
	},
	{
		form: "scoring imports options",
		file: "src/core/scoring/layers.ts",
		code: 'import { opts } from "#core/options/o.ts";',
		category: RESTRICTED,
		message: SCORING,
	},
	{
		form: "a scoring file imports an adapter",
		file: "src/core/scoring/layers.ts",
		code: 'import { o } from "#adapters/omp/o.ts";',
		category: PLUGIN,
		message: CORE,
	},
	{
		form: "transport imports decision",
		file: "src/core/scoring/transport/layers.ts",
		code: 'import { ladder } from "#core/decision/ladder.ts";',
		category: RESTRICTED,
		message: SCORING,
	},
	{
		form: "a format imports a scoring file outside its list",
		file: "src/core/scoring/formats/layers.ts",
		code: 'import { e } from "#core/scoring/maker-registry.ts";',
		category: RESTRICTED,
		message: FORMAT,
	},
	{
		form: "core names a type of an adapter with import().X",
		file: "src/core/brief/layers.ts",
		code: 'export type A = import("#adapters/omp/a.ts").A;',
		category: PLUGIN,
		message: CORE,
	},
	{
		form: "a format imports another core folder",
		file: "src/core/scoring/formats/layers.ts",
		code: 'import { ladder } from "#core/decision/ladder.ts";',
		category: RESTRICTED,
		message: FORMAT,
	},
	{
		form: "an output file imports from a __tests__ folder",
		file: "src/core/output/layers.ts",
		code: 'import { t1 } from "#core/__tests__/support/t1.ts";',
		category: PLUGIN,
		message: TESTS_IMPORT,
	},
	{
		form: "a providers file re-exports from a __tests__ folder",
		file: "src/core/providers/layers.ts",
		code: 'export { t3 } from "#core/__tests__/support/t3.ts";',
		category: PLUGIN,
		message: TESTS_IMPORT,
	},
	{
		form: "a transport file imports a __tests__ folder with import()",
		file: "src/core/scoring/transport/layers.ts",
		code: 'export const t5 = () => import("#core/__tests__/support/t5.ts");',
		category: PLUGIN,
		message: TESTS_IMPORT,
	},
	{
		form: "a brief file imports a __tests__ file for its effects",
		file: "src/core/brief/layers.ts",
		code: 'import "#core/__tests__/support/t6.ts";',
		category: PLUGIN,
		message: TESTS_IMPORT,
	},
	{
		form: "a brief file names a type of a __tests__ file with typeof import()",
		file: "src/core/brief/layers.ts",
		code: 'export type T11 = typeof import("#core/__tests__/support/t11.ts");',
		category: PLUGIN,
		message: TESTS_IMPORT,
	},
	{
		form: "utils imports from a __tests__ folder",
		file: "src/utils/layers.ts",
		code: 'import { t7 } from "./__tests__/support/t7.ts";',
		category: PLUGIN,
		message: TESTS_IMPORT,
	},
	{
		form: "an adapter imports from a __tests__ folder of core",
		file: "src/adapters/omp/layers.ts",
		code: 'import { t9 } from "#core/__tests__/support/t9.ts";',
		category: PLUGIN,
		message: TESTS_IMPORT,
	},
	{
		form: "route.ts imports a wire format",
		file: "src/core/scoring/route.ts",
		code: 'import { s } from "./formats/system-one.ts";',
		category: PLUGIN,
		message: ROUTE,
	},
	{
		form: "route.ts imports transport code with import()",
		file: "src/core/scoring/route.ts",
		code: 'export const t = () => import("./transport/send.ts");',
		category: PLUGIN,
		message: ROUTE,
	},
	{
		form: "route.ts names a type of the registry with import().X",
		file: "src/core/scoring/route.ts",
		code: 'export type E = import("./maker-registry.ts").Endpoint;',
		category: PLUGIN,
		message: ROUTE,
	},
	{
		form: "route.ts imports the registry",
		file: "src/core/scoring/route.ts",
		code: 'import { r } from "./maker-registry.ts";',
		category: PLUGIN,
		message: ROUTE,
	},
	{
		form: "route.ts names a type of the module types with import().X through an alias",
		file: "src/core/scoring/route.ts",
		code: 'export type M = import("#core/scoring/maker-module.ts").Endpoint;',
		category: PLUGIN,
		message: ROUTE,
	},
	{
		form: "route.ts imports a provider module through an alias",
		file: "src/core/scoring/route.ts",
		code: 'import { o } from "#core/scoring/makers/openai.ts";',
		category: PLUGIN,
		message: ROUTE,
	},
	{
		form: "a file of makers/ imports another file of makers/ with ./",
		file: "src/core/scoring/makers/openai.ts",
		code: 'import { g } from "./google.ts";',
		category: PLUGIN,
		message: MAKER_MODULE,
	},
	{
		form: "a file of makers/ imports another file of makers/ through an alias",
		file: "src/core/scoring/makers/openai.ts",
		code: 'import { t } from "#core/scoring/makers/typesafe.ts";',
		category: PLUGIN,
		message: MAKER_MODULE,
	},
	{
		form: "a file of makers/ re-exports another file of makers/ with export … from",
		file: "src/core/scoring/makers/openai.ts",
		code: 'export { g1 } from "./google.ts";',
		category: PLUGIN,
		message: MAKER_MODULE,
	},
	{
		form: "a file of makers/ imports another file of makers/ with import()",
		file: "src/core/scoring/makers/openai.ts",
		code: 'export const g2 = () => import("./google.ts");',
		category: PLUGIN,
		message: MAKER_MODULE,
	},
	{
		form: "a file of makers/ names a type of another file of makers/ with import().X",
		file: "src/core/scoring/makers/openai.ts",
		code: 'export type G3 = import("./google.ts").Google;',
		category: PLUGIN,
		message: MAKER_MODULE,
	},
	{
		form: "a file of makers/ names another file of makers/ with typeof import()",
		file: "src/core/scoring/makers/openai.ts",
		code: 'export type G4 = typeof import("#core/scoring/makers/google.ts");',
		category: PLUGIN,
		message: MAKER_MODULE,
	},
	{
		form: "the registry imports decision",
		file: "src/core/scoring/maker-registry.ts",
		code: 'import { l } from "#core/decision/ladder.ts";',
		category: RESTRICTED,
		message: SCORING,
	},
	{
		form: "ask.ts imports a provider module with ./",
		file: "src/core/scoring/ask.ts",
		code: 'import { o } from "./makers/openai.ts";',
		category: PLUGIN,
		message: MAKERS_OUTSIDE,
	},
	{
		form: "ask.ts imports a provider module through an alias",
		file: "src/core/scoring/ask.ts",
		code: 'import { t } from "#core/scoring/makers/typesafe.ts";',
		category: PLUGIN,
		message: MAKERS_OUTSIDE,
	},
	{
		form: "ask.ts re-exports a provider module with export … from",
		file: "src/core/scoring/ask.ts",
		code: 'export { g1 } from "./makers/google.ts";',
		category: PLUGIN,
		message: MAKERS_OUTSIDE,
	},
	{
		form: "a script imports a provider module with import()",
		file: "scripts/calibrate.ts",
		code: 'export const o2 = () => import("#core/scoring/makers/openai.ts");',
		category: PLUGIN,
		message: MAKERS_OUTSIDE,
	},
	{
		form: "a script names a type of a provider module with import().X",
		file: "scripts/calibrate.ts",
		code: 'export type G3 = import("#core/scoring/makers/google.ts").Google;',
		category: PLUGIN,
		message: MAKERS_OUTSIDE,
	},
	{
		form: "a script names a provider module with typeof import()",
		file: "scripts/calibrate.ts",
		code: 'export type T4 = typeof import("#core/scoring/makers/typesafe.ts");',
		category: PLUGIN,
		message: MAKERS_OUTSIDE,
	},
	{
		form: "route.ts imports transport code through an alias",
		file: "src/core/scoring/route.ts",
		code: 'import { s } from "#core/scoring/transport/send.ts";',
		category: PLUGIN,
		message: ROUTE,
	},
	{
		form: "claude imports omp",
		file: "src/adapters/claude/layers.ts",
		code: 'import { a } from "#adapters/omp/a.ts";',
		category: RESTRICTED,
		message: ADAPTER,
	},
	{
		form: "omp imports claude",
		file: "src/adapters/omp/layers.ts",
		code: 'import { a } from "#adapters/claude/a.ts";',
		category: RESTRICTED,
		message: ADAPTER,
	},
	{
		form: "openclaw imports hermes",
		file: "src/adapters/openclaw/layers.ts",
		code: 'import { a } from "#adapters/hermes/a.ts";',
		category: RESTRICTED,
		message: ADAPTER,
	},
	{
		form: "hermes imports openclaw",
		file: "src/adapters/hermes/layers.ts",
		code: 'import { a } from "#adapters/openclaw/a.ts";',
		category: RESTRICTED,
		message: ADAPTER,
	},
	{
		form: "the OpenClaw entry imports openclaw",
		file: "src/adapters/openclaw/index.ts",
		code: 'import { a } from "openclaw";',
		category: RESTRICTED,
		message: ENTRY_OPENCLAW,
	},
	{
		form: "the OpenClaw entry imports a path of openclaw",
		file: "src/adapters/openclaw/index.ts",
		code: 'import { b } from "openclaw/plugin-sdk";',
		category: RESTRICTED,
		message: ENTRY_ADAPTER,
	},
	{
		form: "the OpenClaw entry imports another adapter",
		file: "src/adapters/openclaw/index.ts",
		code: 'import { c } from "#adapters/omp/c.ts";',
		category: RESTRICTED,
		message: ENTRY_ADAPTER,
	},
	{
		form: "the OpenClaw setup entry imports openclaw",
		file: "src/adapters/openclaw/setup.ts",
		code: 'import { a } from "openclaw";',
		category: RESTRICTED,
		message: ENTRY_OPENCLAW,
	},
	{
		form: "the OpenClaw setup entry imports a path of openclaw",
		file: "src/adapters/openclaw/setup.ts",
		code: 'import { b } from "openclaw/plugin-sdk";',
		category: RESTRICTED,
		message: ENTRY_ADAPTER,
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
		file: "src/core/brief/dynamic.ts",
		code: "export const a = (path: string) => import(path);",
		category: PLUGIN,
		message: DYNAMIC,
	},
	{
		form: "import() of a template",
		file: "src/core/brief/dynamic.ts",
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
	{
		form: "core reads process.env",
		file: "src/core/brief/reads-env.ts",
		code: "export const e = process.env;",
		category: PROCESS_ENV,
		message: PROCESS_ENV_MESSAGE,
	},
	{
		form: "a format calls the global fetch",
		file: "src/core/scoring/formats/globals.ts",
		code: 'export const f = () => fetch("https://example.test");',
		category: GLOBALS,
		message: FETCH_GLOBAL,
	},
	{
		form: "core imports a node: module",
		file: "src/core/brief/node.ts",
		code: 'import { n1 } from "node:https";',
		category: PLUGIN,
		message: CORE_NODE,
	},
	{
		form: "core imports a node: module with import()",
		file: "src/core/brief/node.ts",
		code: 'export const n2 = () => import("node:https");',
		category: PLUGIN,
		message: CORE_NODE,
	},
	{
		form: "core names a type of a node: module with import().X",
		file: "src/core/brief/node.ts",
		code: 'export type N3 = import("node:https").Agent;',
		category: PLUGIN,
		message: CORE_NODE,
	},
	{
		form: "core calls AbortSignal.timeout",
		file: "src/core/brief/node.ts",
		code: "export const n4 = () => AbortSignal.timeout(1);",
		category: PLUGIN,
		message: CORE_TIMEOUT,
	},
	{
		form: "core imports a Node module without the node: protocol",
		file: "src/core/brief/node.ts",
		code: 'import { request } from "https";',
		category: NODE_PROTOCOL,
		message: NODE_PROTOCOL_MESSAGE,
	},
	{
		form: "a core file imports from scripts/ with an alias",
		file: "src/core/brief/outside.ts",
		code: 'import { b } from "#scripts/build.ts";',
		category: PLUGIN,
		message: SRC_OUTSIDE,
	},
	{
		form: "an adapter test imports plugins/ by a parent path",
		file: "src/adapters/omp/__tests__/unit/outside.test.ts",
		code: 'import { r } from "../../../../../plugins/model-router/hooks/register.js";',
		category: PLUGIN,
		message: PARENT,
	},
	{
		form: "a utils file imports from scripts/ through an alias with import()",
		file: "src/utils/outside.ts",
		code: 'export const o = () => import("#scripts/build.ts");',
		category: PLUGIN,
		message: SRC_OUTSIDE,
	},
	{
		form: "an adapter names a type of scripts/ with typeof import()",
		file: "src/adapters/hermes/outside.ts",
		code: 'export type P = typeof import("#scripts/build.ts");',
		category: PLUGIN,
		message: SRC_OUTSIDE,
	},
	{
		form: "a core file imports a parent folder",
		file: "src/core/brief/parent.ts",
		code: 'import { a } from "../parts/a.ts";',
		category: PLUGIN,
		message: PARENT,
	},
	{
		form: "a utils file imports a parent folder with import()",
		file: "src/utils/parent.ts",
		code: 'export const b = () => import("../utils/b.ts");',
		category: PLUGIN,
		message: PARENT,
	},
	{
		form: "a script names a type of a parent folder with typeof import()",
		file: "scripts/parent.ts",
		code: 'export type C = typeof import("../src/core/c.ts");',
		category: PLUGIN,
		message: PARENT,
	},
	{
		form: "a utils file imports core through a folder below and back up",
		file: "src/utils/parent.ts",
		code: 'import { x } from "./sub/../../core/x.ts";',
		category: PLUGIN,
		message: PARENT,
	},
	{
		form: "a multi-word shared reason in a string literal",
		file: "src/core/options/reasons-spelled.ts",
		code: 'export const a = "skipped: caller effort";',
		category: PLUGIN,
		message: SHARED_REASON,
	},
	{
		form: "a one-word shared reason as a whole string literal",
		file: "src/adapters/omp/reasons-spelled.ts",
		code: 'export const b = "timeout";',
		category: PLUGIN,
		message: SHARED_REASON,
	},
	{
		form: "a fixed text of a reason builder in a template literal",
		file: "src/utils/reasons-spelled.ts",
		code: `export const c = (id: string) => \`\${id} is outside the core scope\`;`,
		category: PLUGIN,
		message: SHARED_REASON,
	},
	{
		form: "a one-word shared reason as a string literal type",
		file: "src/adapters/hermes/reasons-spelled.ts",
		code: 'export type D = "failed";',
		category: PLUGIN,
		message: SHARED_REASON,
	},
];

// Each file below obeys every rule of its layer, and some quote an import in a
// comment or a string, which a text scan would take for a real one.
const valid: Record<string, string> = {
	"src/utils/valid.ts": [
		'import { a } from "./a.ts";',
		'// import { x } from "#core/x.ts"',
		"const quoted = 'export * from \"./y.ts\"';",
		"const local = 1;",
		"export { local };",
		"export const v = [a, quoted];",
	].join("\n"),
	"src/core/brief/valid.ts": [
		'import { u } from "#utils/u.ts";',
		'import { t } from "#core/parts/tier.ts";',
		'import { w } from "#core/parts/work.ts";',
		'import { p } from "#core/providers/provider.ts";',
		'import { s } from "./sibling.ts";',
		'// import { x } from "#adapters/omp/x.ts"',
		"// import(path)",
		'export const lazy = () => import("./lazy.ts");',
		'export const withOptions = () => import("./a.json", { with: { type: "json" } });',
		'export type Lazy = typeof import("./lazy.ts");',
		"export const v = [u, t, w, p, s];",
	].join("\n"),
	"src/adapters/claude/valid.ts": [
		'import { c } from "#core/c.ts";',
		'import { u } from "#utils/u.ts";',
		'import { o } from "#adapters/claude/own.ts";',
		'import { s } from "./sibling.ts";',
		"export const v = [c, u, s, o];",
	].join("\n"),
	"src/adapters/omp/valid.ts": [
		'import { c } from "#core/c.ts";',
		'import { u } from "#utils/u.ts";',
		'import { o } from "#adapters/omp/own.ts";',
		"export const v = [c, u, o];",
	].join("\n"),
	"src/adapters/openclaw/valid.ts": [
		'import { c } from "#core/c.ts";',
		'import { o } from "#adapters/openclaw/own.ts";',
		'import { sdk } from "openclaw";',
		"export const v = [c, sdk, o];",
	].join("\n"),
	"src/adapters/hermes/valid.ts": [
		'import { c } from "#core/c.ts";',
		'import { o } from "#adapters/hermes/own.ts";',
		"export const v = [c, o];",
	].join("\n"),
	"src/core/__tests__/unit/reads-env.test.ts": [
		"export const v = process.env;",
	].join("\n"),
	"src/adapters/omp/__tests__/unit/imports-support.test.ts": [
		'import { s } from "#adapters/omp/__tests__/support/s.ts";',
		'import { c } from "#core/__tests__/support/c.ts";',
		"export const v = [s, c];",
	].join("\n"),
	"src/adapters/omp/reads-env.ts": ["export const v = process.env;"].join("\n"),
	"src/core/__tests__/unit/uses-globals.test.ts": [
		'import { readFileSync } from "node:fs";',
		"export const v = [",
		"\tfetch,",
		"\treadFileSync,",
		"\tAbortSignal.timeout(1),",
		"];",
	].join("\n"),
	"src/adapters/omp/uses-globals.ts": [
		'import { readFileSync } from "node:fs";',
		"export const v = [",
		"\tfetch,",
		"\treadFileSync,",
		"\tAbortSignal.timeout(1),",
		"];",
	].join("\n"),
	"src/adapters/__tests__/integration/drives-several.test.ts": [
		'import { a } from "#adapters/omp/a.ts";',
		'import { b } from "#adapters/claude/b.ts";',
		"export const v = [a, b];",
	].join("\n"),
	"scripts/valid.ts": [
		'import { build } from "esbuild";',
		'import { s } from "#core/__tests__/support/s.ts";',
		'import { h } from "./helper.ts";',
		"export const load = (path: string) => import(path);",
		'export const root = new URL("../", import.meta.url);',
		"export const v = [build, s, h];",
	].join("\n"),
};

// Lines that obey the rules, appended to a file that also holds faults. They
// show that a narrow override still allows what its folder allows.
const clean: Record<string, string[]> = {
	"src/core/parts/consumer.ts": [
		'import { p } from "./part.ts";',
		'import { u } from "#utils/u.ts";',
		"export const v = [p, u];",
	],
	"src/core/providers/layers.ts": [
		'import { p } from "#core/parts/part.ts";',
		"export const v = p;",
	],
	"src/core/output/layers.ts": [
		'import { p } from "#core/parts/part.ts";',
		'import { r } from "./reasons.ts";',
		"export const v = [p, r];",
	],
	"src/core/scoring/layers.ts": [
		'import { p } from "#core/providers/provider.ts";',
		'import { r } from "#core/output/reasons.ts";',
		'import { q } from "#core/parts/part.ts";',
		'import { k } from "./ask.ts";',
		'import { e } from "./maker-registry.ts";',
		"export const v = [p, r, q, k, e];",
	],
	"src/core/scoring/makers/openai.ts": [
		'import { s } from "#core/scoring/maker-module.ts";',
		'import { f } from "#core/scoring/formats/system-one.ts";',
		"export const v = [s, f];",
	],
	"src/core/scoring/maker-registry.ts": [
		'import { o } from "./makers/openai.ts";',
		'import { g } from "#core/scoring/makers/google.ts";',
		"export const v = [o, g];",
	],
	"src/core/scoring/ask.ts": [
		'import { e } from "./maker-registry.ts";',
		"export const v = e;",
	],
	"scripts/calibrate.ts": [
		'import { e } from "#core/scoring/maker-registry.ts";',
		"export const v = e;",
	],
	"src/core/scoring/route.ts": [
		'import { a } from "./ask.ts";',
		'import { f } from "./failure.ts";',
		'import { p } from "#core/providers/provider.ts";',
		'import { r } from "#core/output/reasons.ts";',
		"export const v = [a, f, p, r];",
	],
	"src/core/scoring/formats/layers.ts": [
		'import { f } from "#core/scoring/failure.ts";',
		'import { r } from "#core/scoring/reply.ts";',
		'import { m } from "./format.ts";',
		'import { p } from "#core/parts/part.ts";',
		'import { b } from "#core/brief/brief.ts";',
		'import { g } from "#utils/guards.ts";',
		"export const v = [f, r, m, p, b, g];",
	],
	"src/adapters/openclaw/index.ts": [
		'import { c } from "#core/c.ts";',
		'import { g } from "#adapters/openclaw/gates.ts";',
		'import { r } from "./router.ts";',
		"export const v = [c, r, g];",
	],
	"src/adapters/openclaw/setup.ts": [
		'import { c } from "#core/c.ts";',
		'import { s } from "#adapters/openclaw/settings.ts";',
		'import { t } from "./types.ts";',
		"export const v = [c, s, t];",
	],
	"scripts/set-version.ts": [
		'import { readFileSync } from "node:fs";',
		"export const v = readFileSync;",
	],
};

type Diagnostic = {
	category: string;
	severity: string;
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
			({ category }) =>
				category === RESTRICTED ||
				category === PROCESS_ENV ||
				category === GLOBALS ||
				category === PLUGIN ||
				category === NODE_PROTOCOL,
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
			// Biome passes a rule at info, so a planted fault must be an error.
			assert.equal(hits[0]?.severity, "error");
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
