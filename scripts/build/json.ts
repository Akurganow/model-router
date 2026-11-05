import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

export type JsonValue =
	| string
	| number
	| boolean
	| null
	| OneLine
	| JsonValue[]
	| JsonObject;
export type JsonObject = { [key: string]: JsonValue };

// `text` is the serialized document; formatJson turns it into the committed bytes.
export type Rendered = { readonly path: string; readonly text: string };

// Biome keeps an object expanded when its input is expanded, so an object that
// the committed files hold on one line reaches Biome on one line.
export class OneLine {
	readonly value: JsonValue;
	constructor(value: JsonValue) {
		this.value = value;
	}
}

export const oneLine = (value: JsonValue): OneLine => new OneLine(value);

const BIOME = createRequire(import.meta.url).resolve(
	"@biomejs/biome/bin/biome",
);

/**
 * Serializes a value with tab indentation, and writes a OneLine object on one
 * line so Biome keeps it there.
 */
function lines(value: JsonValue, indent: string): string {
	if (value instanceof OneLine) return JSON.stringify(value.value);
	if (typeof value !== "object" || value === null) return JSON.stringify(value);
	const inner = `${indent}\t`;
	const [open, close, members] = Array.isArray(value)
		? ["[", "]", value.map((item) => inner + lines(item, inner))]
		: [
				"{",
				"}",
				Object.entries(value).map(
					([key, member]) =>
						`${inner}${JSON.stringify(key)}: ${lines(member, inner)}`,
				),
			];
	return members.length === 0
		? `${open}${close}`
		: `${open}\n${members.join(",\n")}\n${indent}${close}`;
}

export const serialize = (value: JsonValue): string => `${lines(value, "")}\n`;

// One file formats in well under a second; the bound only stops a stuck formatter.
const BIOME_TIMEOUT_MS = 30_000;

/**
 * Formats JSON text with the repository's own Biome, so a file written here
 * passes biome ci. Throws when Biome fails or runs past its time limit.
 */
export function formatJson(path: string, text: string, root: string): string {
	const run = spawnSync(
		process.execPath,
		[BIOME, "format", `--stdin-file-path=${path}`],
		{ cwd: root, input: text, encoding: "utf8", timeout: BIOME_TIMEOUT_MS },
	);
	if (run.error !== undefined)
		throw new Error(`biome could not format ${path}: ${run.error.message}`);
	if (run.status !== 0)
		throw new Error(`biome could not format ${path}: ${run.stderr}`);
	return run.stdout;
}
