import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { generatedPaths } from "./build.ts";
import { EXIT_USAGE } from "./exit-codes.ts";

// The two key shapes are the ones the redaction in src/brief.ts masks. The
// bearer rule also needs a digit and 16 characters, because prose such as
// "the bearer token" and the masked form "Bearer ***" must pass.
const BEARER_TOKEN = "[A-Za-z0-9._~+/=-]";
const MARKERS = [
	{
		kind: "absolute home path",
		pattern: /(?<![A-Za-z0-9./~])\/(?:Users|home)\/[A-Za-z0-9._-]+/,
	},
	{ kind: "sk- key", pattern: /\bsk-[A-Za-z0-9_-]{8,}/ },
	{
		kind: "Bearer token",
		pattern: new RegExp(
			`Bearer\\s+(?=${BEARER_TOKEN}*\\d)${BEARER_TOKEN}{16,}`,
		),
	},
] as const;

type MarkerKind = (typeof MARKERS)[number]["kind"];
export type Hit = { path: string; line: number; kind: MarkerKind };
type AddedLine = { path: string; line: number; text: string };

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const HUNK_START = /^@@ -\S+ \+(\d+)/;
const NEW_FILE = "+++ b/";
const DEV_NULL = "+++ /dev/null";

export const findMarkers = (text: string): MarkerKind[] =>
	MARKERS.filter(({ pattern }) => pattern.test(text)).map(({ kind }) => kind);

// A hit never carries the matched text, because CI logs are public.
export const formatHit = ({ path, line, kind }: Hit): string =>
	`${path}:${line}: ${kind}`;

const hitsIn = ({ path, line, text }: AddedLine): Hit[] =>
	findMarkers(text).map((kind) => ({ path, line, kind }));

export function scanFiles(root: string, paths: readonly string[]): Hit[] {
	return paths.flatMap((path) =>
		readFileSync(join(root, path), "utf8")
			.split("\n")
			.flatMap((text, index) => hitsIn({ path, line: index + 1, text })),
	);
}

// With --unified=0 every line after a hunk header is content until the next
// file header, so an added line that starts with "++" is not mistaken for one.
export function addedLines(diff: string): AddedLine[] {
	const added: AddedLine[] = [];
	let path: string | undefined;
	let line = 0;
	let inHunk = false;
	for (const text of diff.split("\n")) {
		if (text.startsWith("diff --git ")) inHunk = false;
		else if (!inHunk && text === DEV_NULL) path = undefined;
		else if (!inHunk && text.startsWith(NEW_FILE))
			path = text.slice(NEW_FILE.length);
		else if (HUNK_START.test(text)) {
			inHunk = true;
			line = Number(HUNK_START.exec(text)?.[1]);
		} else if (inHunk && path !== undefined && text.startsWith("+"))
			added.push({ path, line: line++, text: text.slice(1) });
	}
	return added;
}

const isCommit = (root: string, ref: string): boolean =>
	ref !== "" &&
	spawnSync("git", ["cat-file", "-e", `${ref}^{commit}`], { cwd: root })
		.status === 0;

// Computed, not typed, because the id of the empty tree depends on the hash the repository uses.
const emptyTree = (root: string): string =>
	execFileSync("git", ["hash-object", "-t", "tree", "--stdin"], {
		cwd: root,
		input: "",
		encoding: "utf8",
	}).trim();

// A push can name a base the clone lacks, such as the all-zero id or a commit a
// force push dropped. The scan then reads what HEAD adds over its first parent,
// or every line of a first commit, so no added line goes unread.
export function diffRange(
	root: string,
	base: string,
): { range: string[]; note?: string } {
	if (isCommit(root, base)) return { range: [`${base}...HEAD`] };
	const note = `base ${base || "(empty)"} is not a commit in this clone`;
	return isCommit(root, "HEAD^")
		? { range: ["HEAD^", "HEAD"], note: `${note}; scanning the first parent` }
		: {
				range: [emptyTree(root), "HEAD"],
				note: `${note}; scanning all of HEAD`,
			};
}

export function scanDiff(root: string, base: string): Hit[] {
	const diff = execFileSync(
		"git",
		[
			"-c",
			"core.quotepath=false",
			"diff",
			"--unified=0",
			"--no-color",
			...diffRange(root, base).range,
		],
		{ cwd: root, encoding: "utf8", maxBuffer: Infinity },
	);
	return addedLines(diff).flatMap(hitsIn);
}

function baseArgument(args: readonly string[]): string | undefined {
	const at = args.indexOf("--base");
	return at === -1 ? undefined : args[at + 1];
}

if (import.meta.main) {
	const args = process.argv.slice(2);
	const base = baseArgument(args);
	if (args.includes("--base") && base === undefined) {
		console.error("usage: node scripts/scan-owner-setup.ts [--base <commit>]");
		process.exit(EXIT_USAGE);
	}
	const note = base === undefined ? undefined : diffRange(ROOT, base).note;
	if (note) console.error(note);
	const hits = [
		...scanFiles(ROOT, generatedPaths()),
		...(base === undefined ? [] : scanDiff(ROOT, base)),
	];
	for (const hit of hits) console.error(formatHit(hit));
	process.exitCode = hits.length === 0 ? 0 : 1;
}
