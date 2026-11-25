import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { ask } from "#core/options/settings.ts";
import { HARNESS_SETTINGS } from "./build/values.ts";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

const SKILLS = {
	claude: "plugins/model-router/skills/model-router-setup/SKILL.md",
	omp: "plugins/model-router-omp/skills/model-router-setup/SKILL.md",
	openclaw:
		"plugins/model-router-openclaw/openclaw-skills/model-router-setup/SKILL.md",
	hermes: "plugins/model-router-hermes/skills/model-router-setup/SKILL.md",
} as const;

test("each setup skill lists every dialog option of the settings its harness stores", () => {
	for (const [harness, path] of Object.entries(SKILLS)) {
		const text = readFileSync(`${ROOT}${path}`, "utf8");
		for (const setting of HARNESS_SETTINGS[harness as keyof typeof SKILLS]) {
			for (const option of ask(setting, undefined).options) {
				assert.ok(
					text.includes(option),
					`${path} does not list the ${setting} option "${option}"`,
				);
			}
		}
	}
});

const DECLARED_PHRASE = "Compare them with the fields the plugin declares: ";

// Each manifest is a built file, so its own key list is the source of truth.
// The path walks to the object whose keys are the declared fields.
const declaredFields = (file: string, path: readonly string[]) => {
	let node: unknown = JSON.parse(readFileSync(`${ROOT}${file}`, "utf8"));
	for (const key of path)
		node = (node as Record<string, unknown> | undefined)?.[key];
	return Object.keys(node as object).sort();
};

const DECLARED: Record<keyof typeof SKILLS, string[]> = {
	claude: declaredFields("plugins/model-router/.claude-plugin/plugin.json", [
		"userConfig",
	]),
	omp: declaredFields("plugins/model-router-omp/package.json", [
		"omp",
		"settings",
	]),
	openclaw: declaredFields(
		"plugins/model-router-openclaw/openclaw.plugin.json",
		["configSchema", "properties"],
	),
	// plugin.yaml is JSON with spaces only.
	hermes: declaredFields("plugins/model-router-hermes/plugin.yaml", [
		"config_schema",
	]),
};

test("each setup skill's declared-field line names exactly the fields its harness declares", () => {
	for (const [harness, path] of Object.entries(SKILLS)) {
		const lines = readFileSync(`${ROOT}${path}`, "utf8")
			.split("\n")
			.filter((line) => line.includes(DECLARED_PHRASE));
		assert.equal(
			lines.length,
			1,
			`${path} holds ${lines.length} lines with "${DECLARED_PHRASE}", not one`,
		);
		const listed = [...(lines[0] ?? "").matchAll(/`([^`]+)`/g)]
			.map((match) => match[1])
			.sort();
		const declared = DECLARED[harness as keyof typeof SKILLS];
		const missing = declared.filter((field) => !listed.includes(field));
		const extra = listed.filter((field) => !declared.includes(field as string));
		assert.deepEqual(
			{ missing, extra },
			{ missing: [], extra: [] },
			`${harness} setup skill: the declared-field line misses ${missing.join(", ") || "nothing"} and names unknown ${extra.join(", ") || "nothing"}`,
		);
	}
});
