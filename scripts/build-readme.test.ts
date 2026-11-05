import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { README_OUTPUT } from "./build/outputs.ts";
import { anchorOf, installCommands, renderReadme } from "./build/readme.ts";
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

test("each section ends with a link to its setup heading", () => {
	const text = renderReadme(readme("\nold\n"), source);
	for (const heading of ["Claude Code", "Oh My Pi"])
		assert.ok(
			text.includes(
				`[Set up ${heading}](#${anchorOf(`Set up ${heading}`)}) has the next steps.`,
			),
			heading,
		);
});

// GitHub suffixes a repeated heading's anchor with -1, -2 and so on.
const FENCE = /^(```|~~~)/;
const HEADING = /^#{1,6} (.+)$/;
// A line inside a fenced code block, such as a shell comment, is not a heading.
const headingsOf = (markdown: string): string[] => {
	let inFence = false;
	const titles: string[] = [];
	for (const line of markdown.split("\n")) {
		if (FENCE.test(line)) inFence = !inFence;
		const title = inFence ? undefined : HEADING.exec(line)?.[1];
		if (title !== undefined) titles.push(title);
	}
	return titles;
};

const anchorsOf = (markdown: string): Set<string> => {
	const seen = new Map<string, number>();
	const anchors = new Set<string>();
	for (const title of headingsOf(markdown)) {
		const anchor = anchorOf(title);
		const count = seen.get(anchor) ?? 0;
		anchors.add(count === 0 ? anchor : `${anchor}-${count}`);
		seen.set(anchor, count + 1);
	}
	return anchors;
};

test("a heading sign inside a fenced code block makes no anchor", () => {
	const markdown = "# Real\n\n```sh\n# not a heading\n```\n";
	assert.deepEqual([...anchorsOf(markdown)], ["real"]);
});

test("every in-page link of the README lands on a heading", () => {
	const text = readFileSync(join(ROOT, README_OUTPUT), "utf8");
	const anchors = anchorsOf(text);
	for (const [, target] of text.matchAll(/\]\(#([^)]+)\)/g))
		assert.ok(anchors.has(target ?? ""), `README.md links to #${target}`);
});

test("an anchor drops punctuation and joins words with hyphens", () => {
	assert.equal(anchorOf("Set up Oh My Pi"), "set-up-oh-my-pi");
	assert.equal(anchorOf("Turn off and `uninstall`!"), "turn-off-and-uninstall");
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
		assert.match(message, new RegExp(README_OUTPUT.replace(".", "\\.")));
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
// ci.yml indents each job two spaces under `jobs:` and its keys four, and the
// slice below finds a job's end by the next line at two spaces.
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
