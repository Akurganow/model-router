import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { installCommands, README_PATH, renderReadme } from "./build/readme.ts";
import { loadSource, type Source } from "./build/source.ts";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const source = loadSource(ROOT);
const START = "<!-- install:start -->";
const END = "<!-- install:end -->";
const BEFORE = "# Title\n\n## Install\n\nYou need things.\n\n";
const AFTER = "\nAfter the region.\n\n## Verify\n";
const readme = (middle: string) => `${BEFORE}${START}${middle}${END}${AFTER}`;
const withoutCi = (): Source => ({
	...source,
	claude: {
		...source.claude,
		install: { ...source.claude.install, ciSystems: [] },
	},
});

test("the region holds one section for each harness, in order", () => {
	const text = renderReadme(readme("\nold\n"), source);
	const headings = text.match(/^### .+$/gm);
	assert.deepEqual(headings, ["### Claude Code", "### Oh My Pi"]);
});

test("the region names the install commands of both harnesses", () => {
	const text = renderReadme(readme("\nold\n"), source);
	for (const command of [
		"claude plugin marketplace add Akurganow/model-router",
		"claude plugin install model-router@model-router",
		"omp plugin marketplace add Akurganow/model-router",
		"omp plugin install model-router@model-router",
	])
		assert.match(text, new RegExp(`^${command}$`, "m"));
});

test("each section cites the harness documentation", () => {
	const text = renderReadme(readme("\nold\n"), source);
	assert.match(
		text,
		/^Source: Claude Code documentation, \[Install and manage plugins\]\(https:\/\/code\.claude\.com\/docs\/en\/plugins\/install#add-a-marketplace\)\.$/m,
	);
	assert.match(
		text,
		/^Source: Oh My Pi documentation, \[.+\]\(https:\/\/github\.com\/can1357\/oh-my-pi\/blob\/96e4d8eb5ba1212d2d6018f242de266284cffab9\/docs\/marketplace\.md#L\d+-L\d+\)\.$/m,
	);
});

test("a harness that CI installs says so, and one that CI skips says so", () => {
	const installed = renderReadme(readme("\nold\n"), source);
	assert.equal(installed.match(/^CI installs it on Ubuntu\.$/gm)?.length, 2);
	assert.doesNotMatch(installed, /CI does not install it/);
	const skipped = renderReadme(readme("\nold\n"), withoutCi());
	assert.equal(skipped.match(/^CI does not install it\.$/gm)?.length, 1);
	assert.equal(skipped.match(/^CI installs it on Ubuntu\.$/gm)?.length, 1);
});

test("only the region changes, and the rest keeps its bytes", () => {
	const text = renderReadme(readme("\nold\n"), source);
	assert.ok(text.startsWith(`${BEFORE}${START}\n`));
	assert.ok(text.endsWith(`\n${END}${AFTER}`));
	assert.doesNotMatch(text, /\nold\n/);
});

test("a second render changes nothing", () => {
	const once = renderReadme(readme("\nold\n"), source);
	assert.equal(renderReadme(once, source), once);
});

const failure = (text: string) => {
	try {
		renderReadme(text, source);
	} catch (error) {
		return String(error instanceof Error ? error.message : error);
	}
	return assert.fail("renderReadme did not throw");
};

test("a missing marker fails and names the file and the marker", () => {
	for (const marker of [START, END]) {
		const message = failure(readme("\nold\n").replace(marker, ""));
		assert.match(message, new RegExp(README_PATH.replace(".", "\\.")));
		assert.ok(message.includes(marker), message);
		assert.match(message, /missing/);
	}
});

test("a repeated marker fails and names the file and the marker", () => {
	for (const marker of [START, END]) {
		const message = failure(`${readme("\nold\n")}${marker}\n`);
		assert.match(message, /README\.md/);
		assert.ok(message.includes(marker), message);
		assert.match(message, /2 times/);
	}
});

test("reversed markers fail and name the file", () => {
	const message = failure(`${BEFORE}${END}\nold\n${START}${AFTER}`);
	assert.match(message, /README\.md/);
	assert.match(message, /before/);
});

const CI_PATH = ".github/workflows/ci.yml";
const SYSTEM_RUNNERS: Readonly<Record<string, string>> = {
	Ubuntu: "ubuntu-latest",
};
const jobBlock = (workflow: string, job: string): string => {
	const lines = workflow.split("\n");
	const first = lines.indexOf(`  ${job}:`);
	assert.notEqual(first, -1, `${CI_PATH} has no ${job} job`);
	const length = lines
		.slice(first + 1)
		.findIndex((line) => /^ {2}\S/.test(line));
	return lines
		.slice(first, length === -1 ? undefined : first + 1 + length)
		.join("\n");
};

test("each CI claim matches the install job of the workflow", () => {
	const workflow = readFileSync(join(ROOT, CI_PATH), "utf8");
	const block = jobBlock(workflow, "install");
	const runLines = block.split("\n").map((line) => line.trim());
	for (const harness of [source.claude, source.omp]) {
		const { ciSystems } = harness.install;
		for (const system of ciSystems) {
			assert.ok(SYSTEM_RUNNERS[system], `no runner is known for ${system}`);
			assert.match(
				block,
				new RegExp(`^ {4}runs-on: ${SYSTEM_RUNNERS[system]}$`, "m"),
			);
		}
		if (ciSystems.length === 0) continue;
		for (const command of installCommands(source, harness.install, '"$PWD"'))
			assert.ok(
				runLines.includes(command),
				`${CI_PATH} does not run: ${command}`,
			);
	}
});
