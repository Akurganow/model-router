import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";

const PLUGIN_DIR = join(import.meta.dirname, "..");
const CLAUDE_MANIFEST = join(
	PLUGIN_DIR,
	"..",
	"model-router",
	".claude-plugin",
	"plugin.json",
);

const TIERS = [
	{ name: "router_light", model: "@router_light,@smol" },
	{ name: "router_mid", model: "@router_mid,@task" },
	{ name: "router_heavy", model: "@router_heavy,@slow" },
] as const;

// Policy of omp's bundled `task` agent at v18.2.8: no `tools` key, so all
// tools; `spawns: "*"`; thinking level auto.
const BUNDLED_SPAWNS = "*";
const THINKING_LEVEL = "auto";
const OMP_TAG = "v18.2.8";

const BUNDLED_TASK_BODY = `Worker agent: delegated tasks.

Tools: FULL access (edit, write, bash, grep, read, etc.); MUST use as needed to complete task.
MUST hyperfocus assigned task; NEVER deviate.

<directives>
- MUST finish assigned work only; return minimum useful result; do not repeat filesystem writes.
- SHOULD edit files, run commands, create files when task requires.
- MUST concise; NEVER filler, repetition, tool transcripts. User cannot see you; result: notes for yourself.
- AVOID full-file reads unless necessary.
- SHOULD prefer editing existing files over creating new files.
- NEVER create documentation files (\`*.md\`) unless explicitly requested.
- MUST follow assignment and instructions.
- \`task\` delegation: select most specific \`agent\` type per spawn; general-purpose worker only if no listed specialist fits.
</directives>
`;

type Agent = {
	fields: Record<string, string>;
	comments: string[];
	body: string;
};

const FRONTMATTER = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;

const unquote = (value: string): string =>
	value.startsWith('"') ? JSON.parse(value) : value;

const parseAgent = (file: string): Agent => {
	const text = readFileSync(join(PLUGIN_DIR, "agents", file), "utf8");
	const match = FRONTMATTER.exec(text);
	assert.ok(match?.[1] !== undefined, `${file} has frontmatter`);
	const fields: Record<string, string> = {};
	const comments: string[] = [];
	for (const line of match[1].split("\n")) {
		if (line.startsWith("#")) {
			comments.push(line);
			continue;
		}
		const split = line.indexOf(":");
		assert.ok(split > 0, `${file}: "${line}" is a key: value line`);
		fields[line.slice(0, split).trim()] = unquote(line.slice(split + 1).trim());
	}
	return { fields, comments, body: match[2] ?? "" };
};

describe("router agents", () => {
	for (const { name, model } of TIERS) {
		describe(name, () => {
			const agent = parseAgent(`${name}.md`);

			test("has its name and model selector", () => {
				const { name: agentName, model: agentModel } = agent.fields;
				assert.equal(agentName, name);
				assert.equal(agentModel, model);
			});

			test("runs at thinking level auto", () => {
				assert.equal(agent.fields["thinking-level"], THINKING_LEVEL);
			});

			test("keeps the bundled spawn policy and all tools", () => {
				const { spawns, tools } = agent.fields;
				assert.equal(spawns, BUNDLED_SPAWNS);
				assert.equal(tools, undefined);
			});

			test("describes itself as a routed tier", () => {
				const { description } = agent.fields;
				assert.ok(description, "has a description");
				assert.match(description, /model-router/);
				assert.match(description, /routed/);
				assert.match(description, /escalat/);
			});

			test("copies the bundled body verbatim", () => {
				assert.equal(agent.body, BUNDLED_TASK_BODY);
			});

			test("attributes omp, its MIT licence and the tag", () => {
				const line = agent.comments.find((c) => c.includes("Oh My Pi"));
				assert.ok(line, "has an attribution line");
				assert.match(line, /MIT/);
				assert.ok(line.includes(OMP_TAG));
			});
		});
	}

	test("bodies are identical across tiers", () => {
		const bodies = new Set(
			TIERS.map(({ name }) => parseAgent(`${name}.md`).body),
		);
		assert.equal(bodies.size, 1);
	});
});

describe("package", () => {
	const pkg = JSON.parse(
		readFileSync(join(PLUGIN_DIR, "package.json"), "utf8"),
	);
	const claude = JSON.parse(readFileSync(CLAUDE_MANIFEST, "utf8"));

	test("declares the extension entry", () => {
		assert.deepEqual(pkg.omp, { extensions: ["./extension/index.ts"] });
	});

	test("is private, MIT, ESM, without dependencies", () => {
		assert.equal(pkg.private, true);
		assert.equal(pkg.license, "MIT");
		assert.equal(pkg.type, "module");
		assert.equal(pkg.name, "model-router-omp");
		assert.equal(pkg.dependencies, undefined);
		assert.equal(pkg.devDependencies, undefined);
	});

	test("shares the Claude Code plugin version", () => {
		assert.equal(pkg.version, claude.version);
	});

	test("ships no Claude Code manifest", () => {
		assert.equal(existsSync(join(PLUGIN_DIR, ".claude-plugin")), false);
	});
});

describe("license", () => {
	const text = readFileSync(join(PLUGIN_DIR, "LICENSE"), "utf8");
	const root = readFileSync(join(PLUGIN_DIR, "..", "..", "LICENSE"), "utf8");

	test("starts with the repository licence", () => {
		assert.ok(text.startsWith(root));
	});

	test("notices the omp licence for the copied agent body", () => {
		assert.match(text, /can1357\/oh-my-pi/);
		assert.match(text, /Copyright \(c\) 2025 Mario Zechner/);
		assert.match(text, /Copyright \(c\) 2025-2026 Can Bölük/);
		assert.match(text, /Copyright \(c\) 2026 Stencil Labs, Inc\./);
		assert.ok(text.includes(OMP_TAG));
	});
});
