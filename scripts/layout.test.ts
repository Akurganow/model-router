import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, posix, relative, sep } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
	createScanner,
	LanguageVariant,
	SyntaxKind,
	tokenIsIdentifierOrKeyword,
} from "typescript/unstable/ast";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

// A module reference in a source text. `spec` is undefined for an import()
// whose argument is not a string literal.
type Ref = {
	kind: "import" | "export" | "dynamic";
	spec: string | undefined;
};

// Tokens after which a slash divides, so it does not open a regular expression.
const ENDS_OPERAND: ReadonlySet<SyntaxKind> = new Set([
	SyntaxKind.Identifier,
	SyntaxKind.StringLiteral,
	SyntaxKind.NumericLiteral,
	SyntaxKind.NoSubstitutionTemplateLiteral,
	SyntaxKind.TemplateTail,
	SyntaxKind.CloseParenToken,
	SyntaxKind.CloseBracketToken,
	SyntaxKind.CloseBraceToken,
	SyntaxKind.ThisKeyword,
]);

// Reads the specifier of every static import, `export … from` and import(),
// with the TypeScript scanner, so comments, strings, templates and regular
// expressions hide nothing. `import x = require()` is not read: erasableSyntaxOnly rejects it.
function readRefs(code: string): Ref[] {
	const scanner = createScanner(true, LanguageVariant.Standard, code);
	const refs: Ref[] = [];
	// true: the brace closes a template substitution.
	const braces: boolean[] = [];
	// The statement or call being read: a clause of `import`/`export`, the
	// open parenthesis of import(), or its first argument.
	let mode: "import" | "export" | "call" | "arg" | undefined;
	let literal: string | undefined;
	let previous = SyntaxKind.Unknown;
	for (let kind = scanner.scan(); kind !== SyntaxKind.EndOfFile; ) {
		if (kind === SyntaxKind.CloseBraceToken && braces.pop())
			kind = scanner.reScanTemplateToken(false);
		else if (
			(kind === SyntaxKind.SlashToken ||
				kind === SyntaxKind.SlashEqualsToken) &&
			!ENDS_OPERAND.has(previous)
		)
			kind = scanner.reScanSlashToken();
		if (kind === SyntaxKind.OpenBraceToken) braces.push(false);
		if (kind === SyntaxKind.TemplateHead || kind === SyntaxKind.TemplateMiddle)
			braces.push(true);

		if (mode === "call") {
			if (kind === SyntaxKind.StringLiteral) {
				mode = "arg";
				literal = scanner.getTokenValue();
			} else {
				refs.push({ kind: "dynamic", spec: undefined });
				mode = undefined;
			}
		} else if (mode === "arg") {
			const closes =
				kind === SyntaxKind.CloseParenToken || kind === SyntaxKind.CommaToken;
			refs.push({ kind: "dynamic", spec: closes ? literal : undefined });
			mode = undefined;
		} else if (mode !== undefined) {
			const named =
				kind === SyntaxKind.StringLiteral &&
				(previous === SyntaxKind.FromKeyword ||
					(mode === "import" && previous === SyntaxKind.ImportKeyword));
			if (named) {
				refs.push({ kind: mode, spec: scanner.getTokenValue() });
				mode = undefined;
			} else if (mode === "import" && kind === SyntaxKind.OpenParenToken)
				mode = "call";
			else if (
				!(
					tokenIsIdentifierOrKeyword(kind) ||
					kind === SyntaxKind.AsteriskToken ||
					kind === SyntaxKind.OpenBraceToken ||
					kind === SyntaxKind.CloseBraceToken ||
					kind === SyntaxKind.CommaToken ||
					kind === SyntaxKind.StringLiteral
				)
			)
				mode = undefined;
		}
		const member =
			previous === SyntaxKind.DotToken ||
			previous === SyntaxKind.QuestionDotToken;
		if (!member && kind === SyntaxKind.ImportKeyword) mode = "import";
		else if (!member && kind === SyntaxKind.ExportKeyword) mode = "export";

		previous = kind;
		kind = scanner.scan();
	}
	return refs;
}

type Layer = "core" | "utils" | "adapters" | `adapter ${string}`;

// Only tests may sit at the top of adapters/: they drive several adapters, so they may import any of them.
function layerOf(path: string): Layer | undefined {
	if (!path.startsWith("src/") || !path.endsWith(".ts")) return undefined;
	const [top, second, third] = path.slice("src/".length).split("/");
	if ((top === "core" || top === "utils") && second !== undefined) return top;
	if (top !== "adapters" || second === undefined) return undefined;
	if (third !== undefined) return `adapter ${second}`;
	return second.endsWith(".test.ts") ? "adapters" : undefined;
}

const allowed = (from: Layer, to: Layer): boolean => {
	if (from === "utils") return to === "utils";
	if (from === "core") return to === "core" || to === "utils";
	if (from === "adapters") return true;
	return to === from || to === "core" || to === "utils";
};

const target = (from: string, spec: string): string =>
	posix.normalize(posix.join(posix.dirname(from), spec));

// What one file's references break. Paths are relative to the repository root.
function problems(name: string, refs: readonly Ref[]): string[] {
	const found: string[] = [];
	const from = layerOf(name);
	for (const { spec } of refs) {
		if (spec === undefined)
			found.push(
				`${name} calls import() with an argument that is not a string literal`,
			);
		else if (spec.startsWith("#") || spec.startsWith("/"))
			found.push(`${name} imports ${spec}`);
		else if (spec.startsWith(".") && from !== undefined) {
			const to = layerOf(target(name, spec));
			if (to === undefined || !allowed(from, to))
				found.push(`${name} imports ${spec}`);
		}
	}
	return found;
}

const list = (dir: string): string[] =>
	readdirSync(join(ROOT, dir), { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile())
		.map((entry) =>
			relative(ROOT, join(entry.parentPath, entry.name)).split(sep).join("/"),
		);

const src = list("src").filter((name) => name !== "src/tsconfig.json");
// scripts/ counts as a user of src/utils/: the build and the install check
// import utils/error.ts and utils/text.ts, and they run outside every layer.
const scripts = list("scripts").filter((name) => name.endsWith(".ts"));
const refsOf = new Map(
	[...src, ...scripts].map((name) => [
		name,
		readRefs(readFileSync(join(ROOT, name), "utf8")),
	]),
);
const refs = (name: string): readonly Ref[] => refsOf.get(name) ?? [];

test("every source file sits in core/, utils/ or one adapter folder", () => {
	assert.deepEqual(
		src.filter((name) => layerOf(name) === undefined),
		[],
	);
});

test("utils imports only utils, core imports no adapter, and no adapter imports another", () => {
	assert.deepEqual(
		src.flatMap((name) => problems(name, refs(name))),
		[],
	);
});

test("every adapter folder holds an index.ts", () => {
	const folders = new Set(
		src
			.map((name) => name.split("/"))
			.flatMap(([, top, folder, file]) =>
				top === "adapters" && file !== undefined ? [folder] : [],
			),
	);
	assert.deepEqual(
		[...folders].filter(
			(folder) => !src.includes(`src/adapters/${folder}/index.ts`),
		),
		[],
	);
});

test("a test directly in adapters/ imports two or more adapters", () => {
	const lonely = src.filter(
		(name) =>
			layerOf(name) === "adapters" &&
			new Set(
				refs(name)
					.map(
						({ spec }) => spec?.startsWith(".") && layerOf(target(name, spec)),
					)
					.filter((layer) => layer && layer !== "adapters"),
			).size < 2,
	);
	assert.deepEqual(lonely, []);
});

test("each non-test file of utils/ has two or more users outside utils/", () => {
	const importers = new Map<string, Set<string>>();
	for (const [name, found] of refsOf) {
		if (name.startsWith("src/utils/")) continue;
		for (const { spec } of found) {
			if (spec?.startsWith(".") !== true) continue;
			const users = importers.get(target(name, spec)) ?? new Set<string>();
			importers.set(target(name, spec), users.add(name));
		}
	}
	assert.deepEqual(
		src.filter(
			(name) =>
				name.startsWith("src/utils/") &&
				!name.endsWith(".test.ts") &&
				(importers.get(name)?.size ?? 0) < 2,
		),
		[],
	);
});

test("no file of utils/ re-exports from another file", () => {
	assert.deepEqual(
		src.filter(
			(name) =>
				name.startsWith("src/utils/") &&
				refs(name).some(({ kind }) => kind === "export"),
		),
		[],
	);
});

// The reader and the layer rule on small source texts, one row per import form.
const rows: {
	form: string;
	name: string;
	code: string;
	refs: Ref[];
	verdict: string[];
}[] = [
	{
		form: "plain import inside the layer",
		name: "src/core/a.ts",
		code: 'import { x } from "./b.ts";',
		refs: [{ kind: "import", spec: "./b.ts" }],
		verdict: [],
	},
	{
		form: "plain import across a layer",
		name: "src/core/a.ts",
		code: 'import { x } from "../adapters/omp/items.ts";',
		refs: [{ kind: "import", spec: "../adapters/omp/items.ts" }],
		verdict: ["src/core/a.ts imports ../adapters/omp/items.ts"],
	},
	{
		form: "side-effect import",
		name: "src/utils/a.ts",
		code: 'import "../core/tier.ts";',
		refs: [{ kind: "import", spec: "../core/tier.ts" }],
		verdict: ["src/utils/a.ts imports ../core/tier.ts"],
	},
	{
		form: "import type",
		name: "src/core/a.ts",
		code: 'import type { Pi } from "../adapters/omp/types.ts";',
		refs: [{ kind: "import", spec: "../adapters/omp/types.ts" }],
		verdict: ["src/core/a.ts imports ../adapters/omp/types.ts"],
	},
	{
		form: "export from inside the layer",
		name: "src/core/a.ts",
		code: 'export { x } from "../utils/text.ts";',
		refs: [{ kind: "export", spec: "../utils/text.ts" }],
		verdict: [],
	},
	{
		form: "export star from across a layer",
		name: "src/adapters/omp/a.ts",
		code: 'export * from "../hermes/route.ts";',
		refs: [{ kind: "export", spec: "../hermes/route.ts" }],
		verdict: ["src/adapters/omp/a.ts imports ../hermes/route.ts"],
	},
	{
		form: "dynamic import with a literal",
		name: "src/adapters/omp/a.ts",
		code: 'const m = await import("../hermes/route.ts");',
		refs: [{ kind: "dynamic", spec: "../hermes/route.ts" }],
		verdict: ["src/adapters/omp/a.ts imports ../hermes/route.ts"],
	},
	{
		form: "dynamic import with a literal and options",
		name: "src/core/a.ts",
		code: 'await import("./b.json", { with: { type: "json" } });',
		refs: [{ kind: "dynamic", spec: "./b.json" }],
		verdict: ["src/core/a.ts imports ./b.json"],
	},
	{
		form: "comment inside the braces of a utils import",
		name: "src/utils/a.ts",
		code: 'import {\n\ttier, // note\n} from "../core/tier.ts";',
		refs: [{ kind: "import", spec: "../core/tier.ts" }],
		verdict: ["src/utils/a.ts imports ../core/tier.ts"],
	},
	{
		form: "block comment inside the braces of a core import",
		name: "src/core/a.ts",
		code: 'import {\n\tTASK, /* note } from "./b.ts" */\n} from "../adapters/omp/items.ts";',
		refs: [{ kind: "import", spec: "../adapters/omp/items.ts" }],
		verdict: ["src/core/a.ts imports ../adapters/omp/items.ts"],
	},
	{
		form: "import quoted in a comment or a string",
		name: "src/core/a.ts",
		code: '// import x from "../adapters/omp/a.ts"\nconst s = \'import("../hermes/route.ts")\';',
		refs: [],
		verdict: [],
	},
	{
		form: "import() with a template",
		name: "src/adapters/omp/a.ts",
		code: "await import(`../hermes/route.ts`);",
		refs: [{ kind: "dynamic", spec: undefined }],
		verdict: [
			"src/adapters/omp/a.ts calls import() with an argument that is not a string literal",
		],
	},
	{
		form: "import() with a variable",
		name: "src/core/a.ts",
		code: 'const m = "x"; await import(m);',
		refs: [{ kind: "dynamic", spec: undefined }],
		verdict: [
			"src/core/a.ts calls import() with an argument that is not a string literal",
		],
	},
	{
		form: "import() with a computed string",
		name: "src/core/a.ts",
		code: 'await import("./" + name + ".ts");',
		refs: [{ kind: "dynamic", spec: undefined }],
		verdict: [
			"src/core/a.ts calls import() with an argument that is not a string literal",
		],
	},
	{
		form: "import() inside a template substitution",
		name: "src/core/a.ts",
		code: `const t = \`a\${await import("../adapters/omp/a.ts")}b\`;\nimport "./c.ts";`,
		refs: [
			{ kind: "dynamic", spec: "../adapters/omp/a.ts" },
			{ kind: "import", spec: "./c.ts" },
		],
		verdict: ["src/core/a.ts imports ../adapters/omp/a.ts"],
	},
	{
		form: "import after a regular expression with a quote",
		name: "src/core/a.ts",
		code: 'const q = /"/.test(s);\nimport x from "../adapters/omp/a.ts";',
		refs: [{ kind: "import", spec: "../adapters/omp/a.ts" }],
		verdict: ["src/core/a.ts imports ../adapters/omp/a.ts"],
	},
	{
		form: "# alias",
		name: "src/core/a.ts",
		code: 'import { TASK } from "#omp/items.ts";',
		refs: [{ kind: "import", spec: "#omp/items.ts" }],
		verdict: ["src/core/a.ts imports #omp/items.ts"],
	},
	{
		form: "absolute specifier",
		name: "src/utils/a.ts",
		code: 'export { x } from "/src/utils/b.ts";',
		refs: [{ kind: "export", spec: "/src/utils/b.ts" }],
		verdict: ["src/utils/a.ts imports /src/utils/b.ts"],
	},
	{
		form: "package and node: specifiers",
		name: "src/utils/a.ts",
		code: 'import { x } from "node:path";\nimport y from "esbuild";',
		refs: [
			{ kind: "import", spec: "node:path" },
			{ kind: "import", spec: "esbuild" },
		],
		verdict: [],
	},
	{
		form: "import and export that are not module references",
		name: "src/core/a.ts",
		code: 'export const from = "x";\nconst o = { import: "y" };\no.import("z");\nexport default "w";',
		refs: [],
		verdict: [],
	},
	{
		form: "adapter test at the top of adapters/",
		name: "src/adapters/a.test.ts",
		code: 'import "./omp/index.ts";\nimport "./hermes/index.ts";\nimport "../core/a.ts";',
		refs: [
			{ kind: "import", spec: "./omp/index.ts" },
			{ kind: "import", spec: "./hermes/index.ts" },
			{ kind: "import", spec: "../core/a.ts" },
		],
		verdict: [],
	},
	{
		form: "adapter importing core, utils and itself",
		name: "src/adapters/omp/a.ts",
		code: 'import "../../core/a.ts";\nimport "../../utils/b.ts";\nimport "./c.ts";',
		refs: [
			{ kind: "import", spec: "../../core/a.ts" },
			{ kind: "import", spec: "../../utils/b.ts" },
			{ kind: "import", spec: "./c.ts" },
		],
		verdict: [],
	},
	{
		form: "import that climbs out of src/",
		name: "src/core/a.ts",
		code: 'import "../../scripts/build.ts";',
		refs: [{ kind: "import", spec: "../../scripts/build.ts" }],
		verdict: ["src/core/a.ts imports ../../scripts/build.ts"],
	},
];

for (const row of rows)
	test(`reader and layer rule: ${row.form}`, () => {
		const read = readRefs(row.code);
		assert.deepEqual(read, row.refs);
		assert.deepEqual(problems(row.name, read), row.verdict);
	});
