import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
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

const SETUP_HERMES = ".github/actions/setup-hermes/action.yml";

test("the setup-hermes action installs a pinned tag, checks its commit and builds nothing", () => {
	const action = read(SETUP_HERMES);
	assert.match(action, /^ {8}HERMES_TAG: v\d+\.\d+\.\d+$/m);
	assert.match(action, /^ {8}HERMES_COMMIT: [0-9a-f]{40}$/m);
	assert.match(action, /RUNNER_TEMP/);
	assert.match(action, /--branch "\$HERMES_TAG"/);
	assert.match(action, /rev-parse HEAD\)" = "\$HERMES_COMMIT"/);
	assert.match(action, /uv sync --frozen --no-dev --no-build/);
	assert.match(action, /GITHUB_PATH/);
	assert.match(action, /hermes --version/);
});

test("Renovate raises the Hermes tag and commit together with no age delay", () => {
	const config = json(".github/renovate.json");
	const manager = (
		config.customManagers as {
			managerFilePatterns: string[];
			matchStrings: string[];
			datasourceTemplate: string;
			depNameTemplate: string;
		}[]
	).find(
		({ depNameTemplate }) => depNameTemplate === "NousResearch/hermes-agent",
	);
	assert.ok(manager, "no custom manager for Hermes");
	// The tags datasource resolves the commit a new tag points at.
	assert.equal(manager.datasourceTemplate, "github-tags");
	const [pattern = ""] = manager.managerFilePatterns;
	assert.match(SETUP_HERMES, new RegExp(pattern.slice(1, -1)));
	const action = read(SETUP_HERMES);
	const [matchString = ""] = manager.matchStrings;
	const found = new RegExp(matchString).exec(action)?.groups as
		| { currentValue?: string; currentDigest?: string }
		| undefined;
	assert.equal(found?.currentValue, /HERMES_TAG: (\S+)/.exec(action)?.[1]);
	assert.equal(found?.currentDigest, /HERMES_COMMIT: (\S+)/.exec(action)?.[1]);
	const rule = (
		config.packageRules as {
			matchPackageNames?: string[];
			minimumReleaseAge?: unknown;
			groupName?: string;
			allowedVersions?: string;
		}[]
	).find(({ matchPackageNames }) =>
		matchPackageNames?.includes("NousResearch/hermes-agent"),
	);
	assert.ok(rule, "no rule for Hermes");
	// Hermes also tags calendar builds such as v2026.9.24, which outrank the releases as versions.
	const calendar = new RegExp((rule.allowedVersions ?? "").slice(2, -1));
	assert.equal(rule.allowedVersions?.startsWith("!/"), true);
	assert.match("v2026.9.24", calendar);
	assert.doesNotMatch("v0.23.0", calendar);
	assert.equal(rule.minimumReleaseAge, null);
	assert.equal(rule.groupName, "hermes");
});

test("Renovate raises the uv of the setup-hermes action with the actions, after the age rule", () => {
	const config = json(".github/renovate.json");
	const manager = (
		config.customManagers as {
			matchStrings: string[];
			datasourceTemplate: string;
			depNameTemplate: string;
		}[]
	).find(({ depNameTemplate }) => depNameTemplate === "uv");
	assert.ok(manager, "no custom manager for uv");
	assert.equal(manager.datasourceTemplate, "pypi");
	const action = read(SETUP_HERMES);
	const [matchString = ""] = manager.matchStrings;
	const found = new RegExp(matchString).exec(action)?.groups as
		| { currentValue?: string }
		| undefined;
	assert.equal(found?.currentValue, /version: "([^"]+)"/.exec(action)?.[1]);
	const rules = (
		config.packageRules as {
			matchPackageNames?: string[];
			minimumReleaseAge?: unknown;
			groupName?: string;
		}[]
	).filter(({ matchPackageNames }) => matchPackageNames?.includes("uv"));
	assert.deepEqual(
		rules.map(({ groupName }) => groupName),
		["actions"],
	);
	assert.ok(rules.every((rule) => !("minimumReleaseAge" in rule)));
});

// A GitHub expression, escaped so it is not read as a template placeholder.
const RUNNER_TEMP = "\u0024{{ runner.temp }}";

test("no job-level env reads the runner context, which GitHub refuses there", () => {
	// A refused expression fails the whole run before any job starts.
	// A blank line may sit inside the env block; a step's env is indented deeper and is allowed.
	const jobEnvWithRunner =
		/^ {4}env:\n(?:(?: {6}.*|[ \t]*)\n)*? {6}[^\n]*\$\{\{\s*runner\./m;
	assert.match(
		`    env:\n      SAFE: value\n\n      TEMP: ${RUNNER_TEMP}\n`,
		jobEnvWithRunner,
	);
	assert.doesNotMatch(
		`    steps:\n      - run: x\n        env:\n          TEMP: ${RUNNER_TEMP}\n`,
		jobEnvWithRunner,
	);
	for (const workflow of readdirSync(join(ROOT, ".github/workflows")))
		assert.doesNotMatch(
			read(`.github/workflows/${workflow}`),
			jobEnvWithRunner,
			workflow,
		);
});

test("the hermes job keeps its Hermes home under the runner's temp folder from its first step", () => {
	const block = jobBlock(read(".github/workflows/ci.yml"), "hermes");
	const steps = block.slice(block.indexOf("    steps:"));
	const first = steps.indexOf("      - ");
	const second = steps.indexOf("      - ", first + 1);
	assert.match(
		steps.slice(first, second),
		/echo "HERMES_HOME=\$RUNNER_TEMP\/hermes-home" >> "\$GITHUB_ENV"/,
	);
});

test("every action the package, hermes and publish jobs use is pinned to a sha", () => {
	const ci = read(".github/workflows/ci.yml");
	for (const block of [
		publish,
		jobBlock(ci, "package"),
		jobBlock(ci, "hermes"),
		read(SETUP_HERMES),
	])
		for (const [, ref = ""] of block.matchAll(/uses: (\S+)/g))
			assert.match(ref, /^(\.\/|[^@]+@[0-9a-f]{40}$)/, ref);
});

const policy = read(".github/workflows/policy.yml");
const scan = jobBlock(policy, "scan");

test("the policy scan skips drafts and cancels stale pull request runs", () => {
	assert.match(
		policy,
		/^ {2}pull_request:\n {4}types: \[opened, synchronize, reopened, ready_for_review\]$/m,
	);
	assert.match(
		policy,
		/^concurrency:\n {2}group: policy-\$\{\{ github\.event\.pull_request\.number \|\| github\.sha \}\}\n {2}cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}$/m,
	);
	assert.match(
		scan,
		/^ {4}if: github\.event_name != 'pull_request' \|\| !github\.event\.pull_request\.draft$/m,
	);
});

test("a push to main reuses the merged head's verdict when plugin and policy are unchanged", () => {
	const reuse = scan.slice(scan.indexOf("- name: Reuse the head's verdict"));
	assert.match(reuse, /steps\.cache\.outputs\.cache-hit != 'true'/);
	assert.match(reuse, /github\.event_name == 'push'/);
	assert.match(
		reuse,
		/git diff --quiet "\$head" HEAD -- plugins\/model-router \.github\/policy/,
	);
	assert.match(reuse, /actions\/workflows\/policy\.yml\/runs\?head_sha=\$head/);
	assert.match(
		reuse,
		/select\(\.name == "scan" and \.conclusion == "success"\)/,
	);
	assert.match(scan, /^ {6}actions: read$/m);
	for (const name of [
		"Require the API key",
		"Read the Claude Code version",
		"Record the verdict",
	]) {
		const step = scan.slice(scan.indexOf(`- name: ${name}`));
		const header = step.slice(0, step.indexOf("run:"));
		assert.match(header, /steps\.reuse\.outputs\.reused != 'true'/, name);
	}
});

test("the policy scan runs on Sonnet 5.5", () => {
	assert.match(scan, /^ {6}ANTHROPIC_MODEL: claude-sonnet-5-5$/m);
});

const SETUP_OMP = ".github/actions/setup-omp";
const OMP_PINS = ["minimum", "latest"] as const;
const OMP_PACKAGE = "@oh-my-pi/pi-coding-agent";
const ompVersion = (pin: string): string =>
	json(`${SETUP_OMP}/${pin}/package.json`).dependencies[OMP_PACKAGE];
const escapeRegExp = (text: string) =>
	text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

test("each omp pin locks the version its package.json pins", () => {
	for (const pin of OMP_PINS) {
		const version = ompVersion(pin);
		assert.match(version, /^\d+\.\d+\.\d+$/, pin);
		// bun.lock is not JSON: it keeps trailing commas.
		const lock = read(`${SETUP_OMP}/${pin}/bun.lock`);
		assert.match(
			lock,
			new RegExp(
				`"workspaces": \\{\\s*"": \\{\\s*"dependencies": \\{\\s*"${escapeRegExp(OMP_PACKAGE)}": "${escapeRegExp(version)}"`,
			),
			pin,
		);
		assert.match(
			lock,
			new RegExp(
				`"${escapeRegExp(OMP_PACKAGE)}": \\["${escapeRegExp(OMP_PACKAGE)}@${escapeRegExp(version)}", "", \\{.*\\}, "sha512-[^"]+"\\]`,
			),
			pin,
		);
	}
});

test("the README names the minimum omp pin as the minimum version", () => {
	const version = escapeRegExp(ompVersion("minimum"));
	const readme = read("README.md");
	assert.match(
		readme,
		new RegExp(`^\\| Oh My Pi \\|.*\\| v${version} \\|`, "m"),
	);
	assert.match(readme, new RegExp(`v${version} or later`));
});

test("the latest omp pin is not older than the minimum", () => {
	const parts = (pin: string) => ompVersion(pin).split(".").map(Number);
	const [latest, minimum] = [parts("latest"), parts("minimum")];
	const order = latest
		.map((part, i) => part - (minimum[i] ?? 0))
		.find((diff) => diff !== 0);
	assert.ok((order ?? 0) >= 0, `${latest.join(".")} < ${minimum.join(".")}`);
});

test("the install and package jobs run once per omp pin and check the load", () => {
	const ci = read(".github/workflows/ci.yml");
	for (const job of ["install", "package"]) {
		const block = jobBlock(ci, job);
		assert.match(
			block,
			new RegExp(
				`^ {4}name: ${job} \\(omp \\$\\{\\{ matrix\\.omp \\}\\}\\)$`,
				"m",
			),
			job,
		);
		assert.match(block, /^ {6}fail-fast: false$/m, job);
		assert.match(block, /^ {8}omp: \[minimum, latest\]$/m, job);
		assert.match(
			block,
			/- uses: \.\/\.github\/actions\/setup-omp\n {8}with:\n {10}pin: \$\{\{ matrix\.omp \}\}\n/,
			job,
		);
		const setup = block.indexOf("uses: ./.github/actions/setup-omp");
		const load = block.indexOf("run: node scripts/check-omp-load.ts");
		assert.ok(load > setup, `${job} runs no load check after setup-omp`);
		// omp reads PI_CONFIG_DIR relative to the home folder.
		const config = block.indexOf(
			'echo "PI_CODING_AGENT_DIR=$RUNNER_TEMP/omp-config/agent"',
		);
		assert.ok(
			config !== -1 && config < setup,
			`${job} keeps no omp config under the runner's temp folder before setup-omp`,
		);
		assert.match(
			block,
			/PI_CONFIG_DIR=\$\(realpath -m --relative-to="\$HOME" "\$RUNNER_TEMP\/omp-config"\)/,
			job,
		);
	}
});

test("the setup-omp action installs the chosen pin outside the checkout with scripts off", () => {
	const action = read(`${SETUP_OMP}/action.yml`);
	assert.match(
		action,
		/^inputs:\n {2}pin:\n(?: {4}.*\n)* {4}required: true\n/m,
	);
	// The input reaches the script through env, so its text cannot run as a command.
	assert.match(action, /^ {8}PIN: \$\{\{ inputs\.pin \}\}$/m);
	assert.doesNotMatch(
		action.slice(action.indexOf("run: |")),
		/\$\{\{ inputs\./,
	);
	assert.match(action, /minimum\|latest\)/);
	assert.match(action, /RUNNER_TEMP\/omp-\$PIN/);
	assert.match(action, /bun install --frozen-lockfile --ignore-scripts/);
	assert.match(action, /GITHUB_PATH/);
	assert.match(action, /omp --version \| grep -F/);
	assert.match(action, /bun-version: "1\.4\.4"/);
});

test("the evals workflow installs the latest omp unless the dispatch picks the minimum", () => {
	const evals = read(".github/workflows/evals.yml");
	assert.match(
		evals,
		/^ {6}omp:\n(?: {8}.*\n)* {8}type: choice\n(?: {8}.*\n)* {8}default: latest\n/m,
	);
	assert.match(evals, /^ {10}- minimum\n {10}- latest$/m);
	assert.match(
		jobBlock(evals, "omp"),
		/- uses: \.\/\.github\/actions\/setup-omp\n {8}with:\n {10}pin: \$\{\{ inputs\.omp \}\}\n/,
	);
});

test("Renovate raises the latest omp pin at once and the minimum only on approval", () => {
	type Rule = {
		matchManagers?: string[];
		matchFileNames?: string[];
		minimumReleaseAge?: unknown;
		schedule?: string[];
		dependencyDashboardApproval?: boolean;
		groupName?: string;
	};
	const rules: Rule[] = json(".github/renovate.json").packageRules;
	const forFile = (file: string) =>
		rules.filter(({ matchFileNames }) => matchFileNames?.includes(file));
	const [latest, ...moreLatest] = forFile(`${SETUP_OMP}/latest/package.json`);
	assert.ok(latest, "no rule for the latest omp pin");
	assert.equal(moreLatest.length, 0);
	assert.equal(latest.minimumReleaseAge, null);
	assert.deepEqual(latest.schedule, ["at any time"]);
	assert.equal(latest.groupName, "omp latest");
	const [minimum, ...moreMinimum] = forFile(
		`${SETUP_OMP}/minimum/package.json`,
	);
	assert.ok(minimum, "no rule for the minimum omp pin");
	assert.equal(moreMinimum.length, 0);
	assert.equal(minimum.dependencyDashboardApproval, true);
	assert.ok(!("minimumReleaseAge" in minimum));
	assert.equal(minimum.groupName, "omp minimum");
	assert.ok(
		rules.every(
			({ matchFileNames, groupName }) =>
				groupName !== "omp" &&
				!matchFileNames?.some((file) => file.startsWith("evals/omp")),
		),
	);
});

test("Renovate titles bumps of CI-only pins ci, so they release nothing", () => {
	const rules: {
		matchFileNames?: string[];
		matchPackageNames?: string[];
		semanticCommitType?: string;
		groupName?: string;
	}[] = json(".github/renovate.json").packageRules;
	const ci = rules.findIndex(
		({ matchFileNames, semanticCommitType }) =>
			matchFileNames?.includes(".github/actions/**") &&
			semanticCommitType === "ci",
	);
	assert.notEqual(ci, -1, "no rule gives the CI pins the ci type");
	// A later rule overrides an earlier one, so the type rule must follow every group rule.
	const lastGroup = rules.findLastIndex(
		({ groupName }) => groupName !== undefined,
	);
	assert.ok(ci > lastGroup, "a group rule follows the ci type rule");
	// The SDK ships inside every bundle, so its bump releases a version.
	const sdk = rules.find(({ matchPackageNames }) =>
		matchPackageNames?.includes("@typesafe-ai/sdk"),
	);
	assert.equal(sdk?.semanticCommitType, "fix");
});
