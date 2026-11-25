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
