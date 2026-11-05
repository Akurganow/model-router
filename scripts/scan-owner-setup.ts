import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { GENERATED_PATHS } from "./build/outputs.ts";
import { EXIT_USAGE } from "./exit-codes.ts";

// The two key shapes are the ones the redaction in src/brief.ts masks, and the
// bearer rule ignores case as that redaction does. It also needs a digit and
// 16 characters, because prose such as "the bearer token" and the masked form
// "Bearer ***" must pass.
const BEARER_TOKEN = "[A-Za-z0-9._~+/=-]";
const HOME_NAME = "[A-Za-z0-9._-]+";
// A POSIX path counts at the start of a token or after "file://". A Windows
// path starts with a drive letter and takes either slash.
const HOME_PATH = new RegExp(
	`(?:(?<![A-Za-z0-9./~])|(?<=\\bfile://))/(?:Users|home)/${HOME_NAME}` +
		`|\\b[A-Za-z]:[\\\\/]+Users[\\\\/]+${HOME_NAME}`,
);
export const MARKERS = [
	{
		kind: "absolute home path",
		pattern: HOME_PATH,
	},
	{ kind: "sk- key", pattern: /\bsk-[A-Za-z0-9_-]{8,}/ },
	{
		kind: "Bearer token",
		pattern: new RegExp(
			`Bearer\\s+(?=${BEARER_TOKEN}*\\d)${BEARER_TOKEN}{16,}`,
			"i",
		),
	},
] as const;

type MarkerKind = (typeof MARKERS)[number]["kind"];
export type Hit = { path: string; line: number; kind: MarkerKind };
type AddedLine = { path: string; line: number; text: string };

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const HUNK_START = /^@@ -\S+ \+(\d+)/;
const FILE_HEADER = "+++ ";
const NEW_FILE = `${FILE_HEADER}b/`;
const QUOTED_NEW_FILE = `${FILE_HEADER}"b/`;
const TRAILING_TAB = /\t$/;
const MAIN_REF = "origin/main";
const GIT_TIMEOUT_MS = 60_000;

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

const SIMPLE_ESCAPES: Readonly<Record<string, string>> = {
	a: "\x07",
	b: "\b",
	f: "\f",
	n: "\n",
	r: "\r",
	t: "\t",
	v: "\v",
};
const ESCAPE_OR_TEXT = /\\([0-7]{3})|\\(.)|[^\\]+/gs;
const OCTAL_RADIX = 8;

// Git quotes a name that holds a quote, a backslash or a control character, and
// writes bytes outside ASCII as octal escapes that together form UTF-8.
function unquoteGitName(quoted: string): string {
	const chunks = [...quoted.matchAll(ESCAPE_OR_TEXT)].map(
		([text, octal, escaped]) => {
			if (octal !== undefined)
				return Buffer.from([Number.parseInt(octal, OCTAL_RADIX)]);
			if (escaped !== undefined)
				return Buffer.from(SIMPLE_ESCAPES[escaped] ?? escaped);
			return Buffer.from(text);
		},
	);
	return Buffer.concat(chunks).toString("utf8");
}

// Git ends the header of a name that holds a space or a quote with a tab.
function newFilePath(line: string): string | undefined {
	const header = line.replace(TRAILING_TAB, "");
	if (header.startsWith(NEW_FILE)) return header.slice(NEW_FILE.length);
	if (header.startsWith(QUOTED_NEW_FILE) && header.endsWith('"'))
		return unquoteGitName(header.slice(QUOTED_NEW_FILE.length, -1));
	return undefined;
}

// With --unified=0 every line after a hunk header is content until the next
// file header, so an added line that starts with "++" is not mistaken for one.
// An added line under a missing or unreadable header fails the scan, because
// skipping it would let the scan pass a line it never read.
export function addedLines(diff: string): AddedLine[] {
	const added: AddedLine[] = [];
	let path: string | undefined;
	let line = 0;
	let inHunk = false;
	for (const [index, text] of diff.split("\n").entries()) {
		if (text.startsWith("diff --git ")) {
			inHunk = false;
			path = undefined;
		} else if (!inHunk && text.startsWith(FILE_HEADER))
			path = newFilePath(text);
		else if (HUNK_START.test(text)) {
			inHunk = true;
			line = Number(HUNK_START.exec(text)?.[1]);
		} else if (inHunk && text.startsWith("+")) {
			if (path === undefined)
				throw new Error(`unreadable file header before line ${index + 1}`);
			added.push({ path, line: line++, text: text.slice(1) });
		}
	}
	return added;
}

// A git run that timed out or could not start says nothing about the commit,
// so it throws instead of reading as "not a commit" and narrowing the range.
function git(root: string, args: readonly string[]) {
	const run = spawnSync("git", args, {
		cwd: root,
		encoding: "utf8",
		timeout: GIT_TIMEOUT_MS,
	});
	if (run.error !== undefined)
		throw new Error(`git could not run ${args[0]}: ${run.error.message}`);
	return run;
}

const isCommit = (root: string, ref: string): boolean =>
	ref !== "" && git(root, ["cat-file", "-e", `${ref}^{commit}`]).status === 0;

const revision = (
	root: string,
	args: readonly string[],
): string | undefined => {
	const run = git(root, args);
	return run.status === 0 ? run.stdout.trim() : undefined;
};

// Computed, not typed, because the id of the empty tree depends on the hash the repository uses.
const emptyTree = (root: string): string =>
	execFileSync("git", ["hash-object", "-t", "tree", "--stdin"], {
		cwd: root,
		input: "",
		encoding: "utf8",
		timeout: GIT_TIMEOUT_MS,
	}).trim();

// The branch point is where the push began. It is absent when HEAD is
// origin/main itself, as on a force push to main.
function branchPoint(root: string): string | undefined {
	const point = revision(root, ["merge-base", "HEAD", MAIN_REF]);
	return point !== undefined && point !== revision(root, ["rev-parse", "HEAD"])
		? point
		: undefined;
}

// A push can name a base the clone lacks, such as the all-zero id of a new
// branch or a commit a force push dropped. The scan then reads everything HEAD
// adds over the merge base with origin/main. Without that merge base it reads
// only the last commit, which is every line of a first commit. A change of
// several commits can hide a line in an earlier one there, so the note says so.
export function diffRange(
	root: string,
	base: string,
): { range: string[]; note?: string } {
	if (isCommit(root, base)) return { range: [`${base}...HEAD`] };
	const note = `base ${base || "(empty)"} is not a commit in this clone`;
	const point = branchPoint(root);
	if (point !== undefined)
		return {
			range: [point, "HEAD"],
			note: `${note}; scanning from the merge base with ${MAIN_REF}`,
		};
	return isCommit(root, "HEAD^")
		? {
				range: ["HEAD^", "HEAD"],
				note: `${note}; scanning the last commit only, against its first parent`,
			}
		: {
				range: [emptyTree(root), "HEAD"],
				note: `${note}; scanning the last commit only, all of its lines`,
			};
}

const SHORT_ID = 7;

/**
 * Picks the commits the scan diffs. A given base goes through diffRange.
 * Without one the scan reads what HEAD adds over its merge base with
 * origin/main, so a local run checks the branch's own lines. With no
 * origin/main there is no range, and only the generated files are read.
 */
export function planScan(
	root: string,
	base: string | undefined,
): { range?: string[]; note?: string } {
	if (base !== undefined) return diffRange(root, base);
	const point = revision(root, ["merge-base", "HEAD", MAIN_REF]);
	if (point === undefined)
		return {
			note: `no --base and no ${MAIN_REF} in this clone; scanning the generated files only`,
		};
	return {
		range: [point, "HEAD"],
		note: `no --base; scanning from the merge base with ${MAIN_REF}, ${point.slice(0, SHORT_ID)}`,
	};
}

export function scanDiff(root: string, range: readonly string[]): Hit[] {
	const diff = execFileSync(
		"git",
		[
			"-c",
			"core.quotepath=false",
			"diff",
			// Fixed prefixes and no external tools, whatever the user's git config says.
			"--src-prefix=a/",
			"--dst-prefix=b/",
			"--no-ext-diff",
			"--no-textconv",
			"--unified=0",
			"--no-color",
			...range,
		],
		{
			cwd: root,
			encoding: "utf8",
			maxBuffer: Infinity,
			timeout: GIT_TIMEOUT_MS,
		},
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
	const plan = planScan(ROOT, base);
	if (plan.note) console.error(plan.note);
	const hits = [
		...scanFiles(ROOT, GENERATED_PATHS),
		...(plan.range === undefined ? [] : scanDiff(ROOT, plan.range)),
	];
	for (const hit of hits) console.error(formatHit(hit));
	process.exitCode = hits.length === 0 ? 0 : 1;
}
