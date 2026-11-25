import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type Schema, validate } from "./schema.ts";
import {
	type Harness,
	KEY_HOLDERS,
	type KeyHolder,
	type SlotSetting,
	type ValueSetting,
} from "./values.ts";

export const SOURCE_PATH = "metadata/source.json";
const SCHEMA_PATH = "metadata/source.schema.json";

// The title and the one text of a setting or a key field. HARNESS_SETTINGS says which harness stores a setting; each shows this text.
type Option = { readonly title: string; readonly description: string };
type Hint = { readonly label: string; readonly help: string };

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
	readonly privacyPolicyUrls: Readonly<Record<Harness, string>>;
	readonly descriptions: Readonly<
		Record<
			"claude" | "omp",
			{ readonly manifest: string; readonly catalogue: string }
		>
	> & {
		readonly openclaw: { readonly manifest: string };
		readonly hermes: { readonly manifest: string };
	};
	readonly options: Readonly<Record<ValueSetting, Option>>;
	// The scoring model of each provider. Every harness stores it and shows this one text.
	readonly models: Option;
	// The key field of each key holder, shown in every harness that has the field.
	readonly keys: Readonly<Record<KeyHolder, Option>>;
	readonly claude: {
		readonly skills: readonly string[];
		readonly commandContents: Readonly<Record<ValueSetting, string>>;
		readonly userConfig: {
			readonly optionType: string;
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
		// The commands that install the npm package, for the npm README.
		readonly npmCommands: readonly string[];
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
		readonly uiHints: Readonly<Record<SlotSetting, Hint>>;
		readonly install: Install;
	};
	readonly hermes: {
		readonly pluginName: string;
		readonly backendName: string;
		readonly requiresHermes: string;
		readonly settings: Readonly<Record<SlotSetting, Hint>>;
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
 * Lists each member of the key record that is not a key holder, and each key
 * holder with no text. The schema names no holder, so this check is the only
 * one.
 */
export function keyHolderProblems(source: Source): string[] {
	const holders: readonly string[] = KEY_HOLDERS;
	return [
		...holders
			.filter((holder) => !Object.hasOwn(source.keys, holder))
			.map(
				(holder) =>
					`$.keys.${holder}: ${holder} is a key holder, so the text is required`,
			),
		...Object.keys(source.keys)
			.filter((member) => !holders.includes(member))
			.map(
				(member) =>
					`$.keys.${member}: ${member} is not a key holder, so the text is not allowed`,
			),
	];
}

/**
 * Reads metadata/source.json and returns it typed as Source. It throws with
 * every schema problem first, so the cast only names a shape already proven.
 * Then it throws with every member of the key record that does not match the
 * key holders.
 */
export function loadSource(root: string): Source {
	const data = readJson(root, SOURCE_PATH);
	const problems = validate(loadSchema(root), data);
	if (problems.length > 0)
		throw new Error(
			`${SOURCE_PATH} does not match ${SCHEMA_PATH}:\n${problems.join("\n")}`,
		);
	const source = data as Source;
	const holderProblems = keyHolderProblems(source);
	if (holderProblems.length > 0)
		throw new Error(
			`${SOURCE_PATH} does not match the key holders:\n${holderProblems.join("\n")}`,
		);
	return source;
}
