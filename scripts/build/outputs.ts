// The output paths of each harness, each named once. The renderers and the
// bundle list take their paths from here, and generatedFiles in copies.ts lists
// them all. This module imports nothing, so the owner-setup scan reads the
// list without loading esbuild or a renderer.
export const CLAUDE_OUTPUTS = {
	manifest: "plugins/model-router/.claude-plugin/plugin.json",
	catalogue: ".claude-plugin/marketplace.json",
	bundle: "plugins/model-router/hooks/register.js",
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

// The licence of the OpenClaw plugin carries the notice for the SDK its bundle inlines.
export const NPM_FILE_COPIES: readonly Copy[] = [
	{
		from: `${OPENCLAW_DIR}/LICENSE`,
		to: `${NPM_ROOT}/LICENSE`,
	},
	{ from: OMP_OUTPUTS.bundle, to: `${NPM_ROOT}/extension/index.js` },
	{ from: OPENCLAW_OUTPUTS.bundle, to: `${NPM_ROOT}/index.js` },
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
