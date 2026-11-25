// The output paths of each harness, each named once. The renderers and the
// bundle list take their paths from here, and generatedFiles in copies.ts lists
// them all. This module imports nothing, so the owner-setup scan reads the
// list without loading esbuild or a renderer.
export const CLAUDE_DIR = "plugins/model-router";

export const CLAUDE_OUTPUTS = {
	manifest: `${CLAUDE_DIR}/.claude-plugin/plugin.json`,
	catalogue: ".claude-plugin/marketplace.json",
	bundle: `${CLAUDE_DIR}/hooks/register.js`,
} as const;

export const OMP_DIR = "plugins/model-router-omp";
export const OPENCLAW_DIR = "plugins/model-router-openclaw";

export const OMP_OUTPUTS = {
	manifest: "plugins/model-router-omp/package.json",
	catalogue: ".omp-plugin/marketplace.json",
	bundle: "plugins/model-router-omp/extension/index.js",
} as const;

export const OPENCLAW_OUTPUTS = {
	manifest: "plugins/model-router-openclaw/openclaw.plugin.json",
	bundle: "plugins/model-router-openclaw/index.js",
	// The conventional name of OpenClaw's setup entry, which it finds at the plugin root.
	setup: "plugins/model-router-openclaw/setup-api.js",
} as const;

export const HERMES_DIR = "plugins/model-router-hermes";

// plugin.yaml holds JSON text with space indentation, which is valid YAML. Hermes reads it with yaml.safe_load, which refuses a tab, and the version check reads it as JSON.
export const HERMES_OUTPUTS = {
	manifest: `${HERMES_DIR}/plugin.yaml`,
	constants: `${HERMES_DIR}/constants.json`,
	bundle: `${HERMES_DIR}/route.mjs`,
} as const;

export const README_OUTPUT = "README.md";

// The npm tree serves OpenClaw and omp from one folder. Its package.json and
// README are rendered; every other file is a byte copy of a plugin file.
export const NPM_ROOT = "packages/model-router";
export const NPM_OUTPUTS = {
	manifest: `${NPM_ROOT}/package.json`,
	readme: `${NPM_ROOT}/README.md`,
} as const;

export type Copy = { readonly from: string; readonly to: string };

// The licence of the OpenClaw plugin carries the notice for the code ported from the TypeSafe SDK,
// which the OpenClaw bundle and the omp bundle both contain.
export const NPM_FILE_COPIES: readonly Copy[] = [
	{
		from: `${OPENCLAW_DIR}/LICENSE`,
		to: `${NPM_ROOT}/LICENSE`,
	},
	{ from: OMP_OUTPUTS.bundle, to: `${NPM_ROOT}/extension/index.js` },
	{ from: OPENCLAW_OUTPUTS.bundle, to: `${NPM_ROOT}/index.js` },
	{ from: OPENCLAW_OUTPUTS.setup, to: `${NPM_ROOT}/setup-api.js` },
	{
		from: OPENCLAW_OUTPUTS.manifest,
		to: `${NPM_ROOT}/openclaw.plugin.json`,
	},
];

// Each folder is copied whole. OpenClaw's skills sit in a folder of their own,
// because omp reads `skills/` of any package it installs.
export const NPM_FOLDER_COPIES: readonly Copy[] = [
	{ from: `${OMP_DIR}/skills`, to: `${NPM_ROOT}/skills` },
	{
		from: `${OPENCLAW_DIR}/openclaw-skills`,
		to: `${NPM_ROOT}/openclaw-skills`,
	},
];
