import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type Schema, validate } from "./schema.ts";
import {
	HARNESS_SETTINGS,
	HARNESSES,
	type Harness,
	KEY_HOLDERS,
	type KeyHolder,
	type SlotSetting,
	storesSetting,
	VALUE_SETTINGS,
	type ValueSetting,
} from "./values.ts";

export const SOURCE_PATH = "metadata/source.json";
const SCHEMA_PATH = "metadata/source.schema.json";

type Option = {
	readonly title: string;
	readonly descriptions: Readonly<Partial<Record<Harness, string>>>;
};
type Hint = { readonly label: string; readonly help: string };
type SecretHint = Hint & { readonly sensitive: boolean };
// Hermes stores a secret under its variable, so the setting's own name is free: the key holder's name and a fixed ending.
export type HermesKeySetting = `${KeyHolder}_api_key`;
export const hermesKeySetting = (holder: KeyHolder): HermesKeySetting =>
	`${holder}_api_key`;
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
	readonly claude: {
		readonly skills: readonly string[];
		readonly commandContents: Readonly<Record<ValueSetting, string>>;
		readonly userConfig: {
			readonly optionType: string;
			readonly keys: Readonly<Record<KeyHolder, Secret>>;
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
		readonly uiHints: Readonly<Record<SlotSetting, Hint>>;
		readonly keys: Readonly<Record<KeyHolder, SecretHint>>;
		readonly install: Install;
	};
	readonly hermes: {
		readonly pluginName: string;
		readonly backendName: string;
		readonly requiresHermes: string;
		readonly settings: Readonly<Record<SlotSetting, Hint>>;
		readonly keys: Readonly<Record<KeyHolder, Hint>>;
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
 * Lists each option text that does not match the settings its harness stores:
 * a stored setting with no text, and a text for a setting the harness does not
 * store.
 */
export function optionTextProblems(source: Source): string[] {
	const problems: string[] = [];
	for (const harness of HARNESSES)
		for (const setting of HARNESS_SETTINGS[harness])
			if (source.options[setting].descriptions[harness] === undefined)
				problems.push(
					`$.options.${setting}.descriptions.${harness}: ${harness} stores ${setting}, so the text is required`,
				);
	for (const setting of VALUE_SETTINGS)
		for (const harness of HARNESSES)
			if (
				source.options[setting].descriptions[harness] !== undefined &&
				!storesSetting(harness, setting)
			)
				problems.push(
					`$.options.${setting}.descriptions.${harness}: ${harness} does not store ${setting}, so the text is not allowed`,
				);
	return problems;
}

/**
 * Lists each key record that does not hold exactly the members of KEY_HOLDERS:
 * a key holder with no text, and a member that names no key holder. The schema
 * names no holder, so this check is the only one.
 */
export function keyHolderProblems(source: Source): string[] {
	const records: Readonly<Record<string, object>> = {
		"$.claude.userConfig.keys": source.claude.userConfig.keys,
		"$.openclaw.keys": source.openclaw.keys,
		"$.hermes.keys": source.hermes.keys,
	};
	const holders: readonly string[] = KEY_HOLDERS;
	return Object.entries(records).flatMap(([path, record]) => [
		...holders
			.filter((holder) => !Object.hasOwn(record, holder))
			.map(
				(holder) =>
					`${path}.${holder}: ${holder} is a key holder, so the text is required`,
			),
		...Object.keys(record)
			.filter((member) => !holders.includes(member))
			.map(
				(member) =>
					`${path}.${member}: ${member} is not a key holder, so the text is not allowed`,
			),
	]);
}

/**
 * Reads metadata/source.json and returns it typed as Source. It throws with
 * every schema problem first, so the cast only names a shape already proven.
 * Then it throws with every option text that does not match its harness, and
 * with every key record that does not match the key holders.
 */
export function loadSource(root: string): Source {
	const data = readJson(root, SOURCE_PATH);
	const problems = validate(loadSchema(root), data);
	if (problems.length > 0)
		throw new Error(
			`${SOURCE_PATH} does not match ${SCHEMA_PATH}:\n${problems.join("\n")}`,
		);
	const source = data as Source;
	const textProblems = optionTextProblems(source);
	if (textProblems.length > 0)
		throw new Error(
			`${SOURCE_PATH} does not match the settings each harness stores:\n${textProblems.join("\n")}`,
		);
	const holderProblems = keyHolderProblems(source);
	if (holderProblems.length > 0)
		throw new Error(
			`${SOURCE_PATH} does not match the key holders:\n${holderProblems.join("\n")}`,
		);
	return source;
}

/**
 * Returns the text of one option for one harness. loadSource has checked every
 * text against HARNESS_SETTINGS, so this throws only for a pair the source does
 * not hold.
 */
export function optionText(
	source: Source,
	harness: Harness,
	setting: ValueSetting,
): string {
	const text = source.options[setting].descriptions[harness];
	if (text === undefined)
		throw new Error(`${SOURCE_PATH} has no ${harness} text for ${setting}`);
	return text;
}
