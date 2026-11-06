import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type Schema, validate } from "./schema.ts";
import type { ValueSetting } from "./values.ts";

export const SOURCE_PATH = "metadata/source.json";
export const SCHEMA_PATH = "metadata/source.schema.json";

type PerHarness = {
	readonly claude: string;
	readonly omp: string;
	readonly openclaw: string;
};
type WithHermes = PerHarness & { readonly hermes: string };
type Option<Descriptions> = {
	readonly default: string;
	readonly title: string;
	readonly descriptions: Descriptions;
};
type Hint = { readonly label: string; readonly help: string };
type Secret = {
	readonly type: string;
	readonly title: string;
	readonly description: string;
	readonly sensitive: boolean;
};

export type Install = {
	readonly heading: string;
	readonly commands: readonly string[];
	readonly source: {
		readonly publisher: string;
		readonly title: string;
		readonly url: string;
	};
	readonly ciSystems: readonly string[];
	// The whole CI sentence, for a harness whose CI install differs from a user's. Default: built from ciSystems.
	readonly ciLine?: string;
	// A line under the source line.
	readonly note?: string;
};

// This type, metadata/source.schema.json and metadata/source.json change together; build-shape.test.ts holds the first two to each other.
export type Source = {
	readonly name: string;
	readonly version: string;
	readonly license: string;
	readonly homepage: string;
	readonly repository: string;
	readonly author: { readonly name: string; readonly url: string };
	readonly keywords: readonly string[];
	readonly privacyPolicyUrls: WithHermes;
	readonly descriptions: Readonly<
		Record<
			"claude" | "omp",
			{ readonly manifest: string; readonly catalogue: string }
		>
	> & {
		readonly openclaw: { readonly manifest: string };
		readonly hermes: { readonly manifest: string };
	};
	// Hermes has the provider option and no scope option.
	readonly options: Readonly<
		Record<Exclude<ValueSetting, "provider">, Option<PerHarness>>
	> & { readonly provider: Option<WithHermes> };
	readonly claude: {
		readonly skills: readonly string[];
		readonly commandContents: Readonly<Record<ValueSetting, string>>;
		readonly userConfig: {
			readonly optionType: string;
			readonly keys: {
				readonly api_key: Secret;
				readonly openrouter_api_key: Secret;
			};
		};
		readonly catalogueSource: string;
		readonly install: Install;
	};
	readonly omp: {
		readonly package: {
			readonly name: string;
			readonly private: boolean;
			readonly type: string;
			readonly extensions: readonly string[];
		};
		readonly settingType: string;
		readonly catalogueSource: string;
		readonly install: Install;
	};
	readonly openclaw: {
		readonly pluginId: string;
		readonly name: string;
		readonly settingType: string;
		readonly extensions: readonly string[];
		readonly skills: readonly string[];
		// One OpenClaw version behind compat, build and install.minHostVersion.
		readonly hostFloor: string;
		readonly uiHints: {
			readonly small_model: Hint;
			readonly large_model: Hint;
			readonly api_key: Hint & { readonly sensitive: boolean };
			readonly openrouter_api_key: Hint & { readonly sensitive: boolean };
		};
		readonly install: Install;
	};
	readonly hermes: {
		readonly pluginName: string;
		readonly backendName: string;
		readonly requiresHermes: string;
		readonly settings: {
			readonly small_model: Hint;
			readonly large_model: Hint;
			readonly typesafe_api_key: Hint;
		};
		readonly install: Install;
	};
	readonly npm: {
		readonly name: string;
		readonly private: boolean;
		readonly type: string;
		readonly description: string;
		readonly keywords: readonly string[];
		readonly publishConfig: { readonly access: string };
	};
};

const readJson = (root: string, path: string): unknown =>
	JSON.parse(readFileSync(join(root, path), "utf8"));

export const loadSchema = (root: string): Schema =>
	readJson(root, SCHEMA_PATH) as Schema;

/**
 * Reads metadata/source.json and returns it typed as Source. It throws with
 * every schema problem first, so the cast only names a shape already proven.
 */
export function loadSource(root: string): Source {
	const data = readJson(root, SOURCE_PATH);
	const problems = validate(loadSchema(root), data);
	if (problems.length > 0)
		throw new Error(
			`${SOURCE_PATH} does not match ${SCHEMA_PATH}:\n${problems.join("\n")}`,
		);
	return data as Source;
}
