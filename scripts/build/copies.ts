import { cpSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import {
	CLAUDE_OUTPUTS,
	type Copy,
	NPM_FILE_COPIES,
	NPM_FOLDER_COPIES,
	NPM_OUTPUTS,
	OMP_OUTPUTS,
	OPENCLAW_OUTPUTS,
	README_OUTPUT,
} from "./outputs.ts";

// Paths are relative to the folder given, with forward slashes, in a fixed order.
function filesUnder(root: string, folder: string): string[] {
	return readdirSync(join(root, folder), { withFileTypes: true })
		.sort((a, b) => (a.name < b.name ? -1 : 1))
		.flatMap((entry) =>
			entry.isDirectory()
				? filesUnder(root, `${folder}/${entry.name}`)
				: [`${folder}/${entry.name}`],
		);
}

// Every file the npm tree copies from a plugin folder, with the file it copies.
export function listCopies(root: string): Copy[] {
	return [
		...NPM_FILE_COPIES,
		...NPM_FOLDER_COPIES.flatMap(({ from, to }) =>
			filesUnder(root, from).map((path) => ({
				from: path,
				to: `${to}${path.slice(from.length)}`,
			})),
		),
	];
}

// The one list of every file the builder writes: each output, the README and
// every copy, the files inside the copied folders included.
export const generatedFiles = (root: string): string[] => [
	...new Set([
		...Object.values(CLAUDE_OUTPUTS),
		...Object.values(OMP_OUTPUTS),
		...Object.values(OPENCLAW_OUTPUTS),
		README_OUTPUT,
		...Object.values(NPM_OUTPUTS),
		...listCopies(root).map(({ to }) => to),
	]),
];

// A folder is removed first, so a file taken out of a plugin folder leaves the tree.
export function copyNpmFiles(root: string): void {
	for (const { to } of NPM_FOLDER_COPIES)
		rmSync(join(root, to), { recursive: true, force: true });
	for (const { from, to } of listCopies(root)) {
		mkdirSync(dirname(join(root, to)), { recursive: true });
		cpSync(join(root, from), join(root, to));
	}
}
