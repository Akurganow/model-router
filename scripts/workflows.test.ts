import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const json = (path: string) => JSON.parse(read(path));

/**
 * Returns the lines of one job in a workflow, from its header to the next line
 * indented two spaces, comment or job. A workflow indents each job two spaces
 * under `jobs:`. Fails the test when the job is missing.
 */
function jobBlock(workflow: string, job: string): string {
	const lines = workflow.split("\n");
	const first = lines.indexOf(`  ${job}:`);
	assert.notEqual(first, -1, `no ${job} job`);
	const length = lines
		.slice(first + 1)
		.findIndex((line) => /^ {2}\S/.test(line));
	return lines
		.slice(first, length === -1 ? undefined : first + 1 + length)
		.join("\n");
}

const release = read(".github/workflows/release.yml");
const publish = jobBlock(release, "publish");

test("the publish job runs after a release and only when publishing is on", () => {
	assert.match(publish, /^ {4}needs: release$/m);
	assert.match(publish, /needs\.release\.outputs\.released == 'true'/);
	assert.match(publish, /vars\.NPM_PUBLISH == 'true'/);
});

test("the release job hands its tag and outcome to the publish job", () => {
	const block = jobBlock(release, "release");
	assert.match(block, /released: \$\{\{ steps\.bump\.outputs\.released \}\}/);
	assert.match(block, /tag: \$\{\{ steps\.bump\.outputs\.tag \}\}/);
});

test("the publish job reads contents, gets an identity token and holds no token", () => {
	assert.match(
		publish,
		/permissions:\n {6}contents: read\n {6}id-token: write\n/,
	);
	assert.doesNotMatch(publish, /contents: write/);
	assert.doesNotMatch(publish, /secrets\./);
	assert.doesNotMatch(publish, /NODE_AUTH_TOKEN|NPM_TOKEN/);
});

test("the publish job checks out the new tag and runs no lifecycle script", () => {
	assert.match(publish, /ref: \$\{\{ needs\.release\.outputs\.tag \}\}/);
	assert.match(publish, /persist-credentials: false/);
	assert.match(
		publish,
		/npm publish --provenance --access public --ignore-scripts/,
	);
	assert.match(publish, /working-directory: packages\/model-router/);
});

test("the publish job skips a version already on the registry and checks npm", () => {
	assert.match(publish, /npm view/);
	assert.match(publish, /11\.5\.1/);
});

test("the workflow documents the variable that turns publishing on", () => {
	assert.match(release, /NPM_PUBLISH/);
});

test("the setup-openclaw action locks the version package.json pins", () => {
	const dir = ".github/actions/setup-openclaw";
	const manifest = json(`${dir}/package.json`);
	const lock = json(`${dir}/package-lock.json`);
	const version = manifest.dependencies.openclaw;
	assert.match(version, /^\d+\.\d+\.\d+$/);
	assert.equal(lock.packages["node_modules/openclaw"].version, version);
	// A package bundled inside another package's tarball is covered by that tarball's digest.
	for (const [path, entry] of Object.entries<{
		integrity?: string;
		inBundle?: boolean;
	}>(lock.packages))
		if (path !== "" && entry.inBundle !== true)
			assert.match(entry.integrity ?? "", /^sha512-/, path);
});

test("the setup-openclaw action installs outside the checkout with scripts off", () => {
	const action = read(".github/actions/setup-openclaw/action.yml");
	assert.match(action, /RUNNER_TEMP/);
	assert.match(action, /npm ci --ignore-scripts/);
	assert.match(action, /GITHUB_PATH/);
	assert.match(action, /openclaw --version/);
});

test("Renovate raises the OpenClaw pin with no age delay", () => {
	const rules: {
		matchPackageNames?: string[];
		minimumReleaseAge?: unknown;
		groupName?: string;
	}[] = json(".github/renovate.json").packageRules;
	const rule = rules.find(({ matchPackageNames }) =>
		matchPackageNames?.includes("openclaw"),
	);
	assert.ok(rule, "no rule for openclaw");
	assert.equal(rule.minimumReleaseAge, null);
	assert.equal(rule.groupName, "openclaw");
	// A later rule overrides an earlier one, so the OpenClaw rule must come after the npm group.
	const npmGroup = rules.findIndex(
		({ groupName }) => groupName === "npm tools",
	);
	assert.ok(rules.indexOf(rule) > npmGroup);
});

test("every action the package job and the publish job use is pinned to a sha", () => {
	const ci = read(".github/workflows/ci.yml");
	for (const block of [publish, jobBlock(ci, "package")])
		for (const [, ref = ""] of block.matchAll(/uses: (\S+)/g))
			assert.match(ref, /^(\.\/|[^@]+@[0-9a-f]{40}$)/, ref);
});
