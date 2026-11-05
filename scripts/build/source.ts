import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type Schema, validate } from "./schema.ts";
import type { ValueSetting } from "./values.ts";

export const SOURCE_PATH = "metadata/source.json";
export const SCHEMA_PATH = "metadata/source.schema.json";

type PerHarness = { readonly claude: string; readonly omp: string };
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
	readonly privacyPolicyUrls: PerHarness;
	readonly descriptions: Readonly<
		Record<
			"claude" | "omp",
			{ readonly manifest: string; readonly catalogue: string }
		>
	>;
	readonly options: Readonly<
		Record<
			ValueSetting,
			{
				readonly default: string;
				readonly title: string;
				readonly descriptions: PerHarness;
			}
		>
	>;
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
