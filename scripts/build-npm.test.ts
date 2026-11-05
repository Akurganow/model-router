import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { copyNpmFiles, generatedFiles, listCopies } from "./build/copies.ts";
import { formatRendered } from "./build/json.ts";
import { renderNpm } from "./build/npm.ts";
import * as outputs from "./build/outputs.ts";
import {
	NPM_OUTPUTS,
	NPM_ROOT,
	OMP_OUTPUTS,
	OPENCLAW_DIR,
	OPENCLAW_OUTPUTS,
} from "./build/outputs.ts";
import { type Schema, validate } from "./build/schema.ts";
import { loadSchema, loadSource } from "./build/source.ts";
import { anchorsOf } from "./markdown-anchors.ts";
import { useTempRoot } from "./temp-root.ts";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const source = loadSource(ROOT);
const rendered = renderNpm(source);
const textOf = (path: string) =>
	rendered.find((file) => file.path === path)?.text;
const pkg = JSON.parse(textOf(NPM_OUTPUTS.manifest) ?? "{}");
const OMP_SIBLINGS = [
	"skills",
	"commands",
	"tools",
	"hooks",
	"rules",
	"prompts",
	".mcp.json",
	"mcp.json",
];

test("the npm renderer writes the package.json and the README", () => {
	assert.deepEqual(
		rendered.map(({ path }) => path),
		[NPM_OUTPUTS.manifest, NPM_OUTPUTS.readme],
	);
});

test("the package.json names the scoped package at the repository version", () => {
	assert.equal(pkg.name, "@akurganow/model-router");
	assert.equal(pkg.name, source.npm.name);
	assert.equal(pkg.version, source.version);
	assert.equal(pkg.private, false);
	assert.equal(pkg.type, "module");
	assert.deepEqual(pkg.publishConfig, { access: "public" });
	assert.deepEqual(pkg.repository, {
		type: "git",
		url: "git+https://github.com/Akurganow/model-router.git",
		directory: "packages/model-router",
	});
	assert.equal(pkg.homepage, source.homepage);
	assert.equal(pkg.license, source.license);
	assert.equal(pkg.dependencies, undefined);
	assert.equal(pkg.devDependencies, undefined);
});

test("the omp blocks equal the omp plugin's", () => {
	const omp = JSON.parse(read(OMP_OUTPUTS.manifest));
	assert.deepEqual(pkg.omp, omp.omp);
});

test("the OpenClaw blocks name the entry and hold the floor three times", () => {
	assert.deepEqual(pkg.openclaw.extensions, source.openclaw.extensions);
	assert.deepEqual(pkg.openclaw.compat, { pluginApi: ">=2026.10.10" });
	assert.deepEqual(pkg.openclaw.build, { openclawVersion: "2026.10.10" });
	assert.equal(pkg.openclaw.install.minHostVersion, ">=2026.10.10");
	assert.equal(pkg.openclaw.install.npmSpec, pkg.name);
});

test("the README links both plugin READMEs and both privacy policies", () => {
	const text = textOf(NPM_OUTPUTS.readme) ?? "";
	for (const url of [
		`${source.homepage}/blob/main/plugins/model-router-omp/README.md`,
		`${source.homepage}/blob/main/plugins/model-router-openclaw/README.md`,
		source.privacyPolicyUrls.omp,
		source.privacyPolicyUrls.openclaw,
	])
		assert.ok(text.includes(`(${url})`), url);
});

test("each rendered file equals the committed file byte for byte", () => {
	for (const { path, text } of rendered)
		assert.equal(formatRendered(path, text, ROOT), read(path), path);
});

test("every copy equals its source byte for byte", () => {
	const copies = listCopies(ROOT);
	assert.ok(copies.length >= 8);
	for (const { from, to } of copies)
		assert.equal(
			readFileSync(join(ROOT, to)).compare(readFileSync(join(ROOT, from))),
			0,
			to,
		);
});

test("the copies cover the licence, both bundles, the manifest and both skill folders", () => {
	const targets = listCopies(ROOT).map(({ to }) => to);
	for (const path of [
		`${NPM_ROOT}/LICENSE`,
		`${NPM_ROOT}/extension/index.js`,
		`${NPM_ROOT}/index.js`,
		`${NPM_ROOT}/openclaw.plugin.json`,
		`${NPM_ROOT}/skills/model-router/SKILL.md`,
		`${NPM_ROOT}/openclaw-skills/model-router-setup/SKILL.md`,
	])
		assert.ok(targets.includes(path), path);
});

test("the generated paths list every rendered file, copy and bundle of the tree", () => {
	const listed = new Set(generatedFiles(ROOT));
	for (const path of [
		NPM_OUTPUTS.manifest,
		NPM_OUTPUTS.readme,
		OPENCLAW_OUTPUTS.manifest,
		OPENCLAW_OUTPUTS.bundle,
		`${NPM_ROOT}/openclaw.plugin.json`,
		`${NPM_ROOT}/index.js`,
		`${NPM_ROOT}/extension/index.js`,
	])
		assert.ok(listed.has(path), path);
});

test("outputs.ts holds no second list of generated files", () => {
	assert.equal("GENERATED_PATHS" in outputs, false);
});

test("the generated files hold every output, every copy and the README", () => {
	const listed = new Set(generatedFiles(ROOT));
	for (const path of [
		...Object.values(outputs.CLAUDE_OUTPUTS),
		...Object.values(outputs.OMP_OUTPUTS),
		...Object.values(outputs.OPENCLAW_OUTPUTS),
		outputs.README_OUTPUT,
		...listCopies(ROOT).map(({ to }) => to),
	])
		assert.ok(listed.has(path), path);
	assert.equal(listed.size, generatedFiles(ROOT).length);
});

test("no skill the tree copies links to a relative path", () => {
	const skills = listCopies(ROOT).filter(({ from }) =>
		from.endsWith("SKILL.md"),
	);
	assert.ok(skills.length >= 4);
	for (const { from } of skills)
		assert.doesNotMatch(read(from), /\]\(\.\.\//, from);
});

test("each repository link in a copied skill lands on a file and a heading", () => {
	const prefix = `${source.homepage}/blob/main/`;
	const pattern = new RegExp(`\\]\\(${prefix}([^)#]+)(?:#([^)]+))?\\)`, "g");
	let found = 0;
	for (const { from } of listCopies(ROOT).filter(({ from }) =>
		from.endsWith("SKILL.md"),
	))
		for (const [, path = "", anchor] of read(from).matchAll(pattern)) {
			found += 1;
			assert.ok(existsSync(join(ROOT, path)), `${from} links to ${path}`);
			if (anchor)
				assert.ok(
					anchorsOf(read(path)).has(anchor),
					`${from} links to ${path}#${anchor}`,
				);
		}
	assert.ok(found >= 5, `found ${found} repository links`);
});

test("no OpenClaw file in the tree uses a name omp reads as a sibling", () => {
	const fromOpenclaw = listCopies(ROOT).filter(({ from }) =>
		from.startsWith("plugins/model-router-openclaw/"),
	);
	assert.ok(fromOpenclaw.length > 0);
	for (const { to } of fromOpenclaw) {
		const [top = ""] = to.slice(NPM_ROOT.length + 1).split("/");
		assert.ok(!OMP_SIBLINGS.includes(top), to);
	}
	assert.ok(
		!OMP_SIBLINGS.includes(source.openclaw.skills[0]?.replace("./", "") ?? ""),
	);
});

test("the files list matches what npm packs", () => {
	const run = spawnSync("npm", ["pack", "--dry-run", "--json"], {
		cwd: join(ROOT, NPM_ROOT),
		encoding: "utf8",
	});
	assert.equal(run.status, 0, run.stderr);
	const packed: string[] = JSON.parse(run.stdout)[0].files.map(
		(file: { path: string }) => file.path,
	);
	const inTree = listCopies(ROOT)
		.map(({ to }) => to.slice(NPM_ROOT.length + 1))
		.concat(["package.json", "README.md"]);
	assert.deepEqual([...packed].sort(), [...new Set(inTree)].sort());
	for (const entry of pkg.files)
		assert.ok(
			packed.some((path) => path === entry || path.startsWith(`${entry}/`)),
			entry,
		);
});

test("the npm block and the openclaw block validate against the schema", () => {
	const schema: Schema = loadSchema(ROOT);
	const data = JSON.parse(read("metadata/source.json"));
	assert.deepEqual(validate(schema, data), []);
	delete data.npm.publishConfig;
	delete data.openclaw.hostFloor;
	assert.deepEqual(validate(schema, data), [
		"$.openclaw.hostFloor: required key is missing",
		"$.npm.publishConfig: required key is missing",
	]);
});

const box = useTempRoot("build-npm-", (put) => {
	put(`${OPENCLAW_DIR}/LICENSE`, "licence\n");
	put(OMP_OUTPUTS.bundle, "omp bundle\n");
	put(OPENCLAW_OUTPUTS.manifest, "{}\n");
	put(OPENCLAW_OUTPUTS.bundle, "claw bundle\n");
	put("plugins/model-router-omp/skills/a/SKILL.md", "omp a\n");
	put("plugins/model-router-openclaw/openclaw-skills/b/SKILL.md", "claw b\n");
});

test("a file removed from a plugin folder disappears from the tree on the next copy", () => {
	copyNpmFiles(box.root);
	assert.equal(box.read(`${NPM_ROOT}/skills/a/SKILL.md`), "omp a\n");
	assert.equal(box.read(`${NPM_ROOT}/openclaw-skills/b/SKILL.md`), "claw b\n");
	box.put("plugins/model-router-omp/skills/c/SKILL.md", "omp c\n");
	copyNpmFiles(box.root);
	assert.equal(box.read(`${NPM_ROOT}/skills/c/SKILL.md`), "omp c\n");
	rmSync(join(box.root, "plugins/model-router-omp/skills/a"), {
		recursive: true,
	});
	copyNpmFiles(box.root);
	assert.equal(
		existsSync(join(box.root, NPM_ROOT, "skills/a/SKILL.md")),
		false,
	);
	assert.equal(box.read(`${NPM_ROOT}/skills/c/SKILL.md`), "omp c\n");
	assert.equal(box.read(`${NPM_ROOT}/extension/index.js`), "omp bundle\n");
});
