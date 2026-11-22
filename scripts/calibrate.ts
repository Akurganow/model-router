import { readFileSync, writeFileSync } from "node:fs";
import { prepareBrief, routingState } from "#core/brief/brief.ts";
import { formatProbability } from "#core/output/line.ts";
import { tier } from "#core/parts/tier.ts";
import { work } from "#core/parts/work.ts";
import {
	type Attempt,
	type Choice,
	holders,
	type KeyHolder,
	type Maker,
	plan,
} from "#core/providers/provider.ts";
import { endpointOf } from "#core/scoring/endpoints.ts";
import { limitSignal, ROUTING_LIMIT_MS } from "#core/scoring/limit.ts";
import { type Decision, route, type Skipped } from "#core/scoring/route.ts";
import type { Fetch } from "#core/scoring/transport/send.ts";
import { realClock } from "#utils/clock.ts";
import { EXIT_INTERRUPTED, EXIT_USAGE } from "./exit-codes.ts";
import { fitWarnings } from "./jev-fit.ts";

const AGREEMENT_BAR = 0.85;
const CASE_HEAD_CHARS = 60;
const PERCENT = 100;
// The factors of the pick rule and the question texts are fitted to this maker's answers.
const MAKER: Maker = "typesafe";
// The gateways the script calibrates through: the maker's own API, and OpenRouter.
const ASKED_GATEWAYS = ["direct", "openrouter"] as const;
// The key holders the script asks, each with the choice that reaches its endpoint.
const ASKED = ASKED_GATEWAYS.flatMap((gateway) => {
	const choice: Choice = { provider: MAKER, gateway };
	return holders(choice).map((holder) => ({ holder, choice }));
});

// The endpoint row of the step a key holder's choice asks. The prompt needs it before a key is typed, so the key is a stand-in that only the plan reads.
function rowOf(holder: KeyHolder, choice: Choice) {
	const [step] = plan(choice, { [holder]: "-" });
	const row = step && endpointOf(step);
	if (!row) throw new Error(`no endpoint row for ${holder}`);
	return row;
}
const USAGE = `usage: node scripts/calibrate.ts <${ASKED.map(({ holder }) => holder).join("|")}> [model] [--record <file>]  (the cases go to: ${ASKED.map(({ holder, choice }) => `${holder} ${rowOf(holder, choice).url}`).join(", ")}; enter that provider's API key at the prompt, or pipe it on stdin; model defaults to jev-latest; --record writes each case's labels and probabilities to <file> as JSONL)`;

export type Case = {
	role: string;
	description: string;
	text: string;
	expected: number;
	work: number;
};

// The printed head comes from the prepared brief, so the output shows only what TypeSafe received.
export const caseHead = (text: string): string =>
	prepareBrief(text).slice(0, CASE_HEAD_CHARS).replace(/\n/g, " ");

export async function runCase(
	c: Case,
	attempts: readonly Attempt[],
	fetchFn: Fetch,
): Promise<Decision | Skipped> {
	const limit = limitSignal(ROUTING_LIMIT_MS, realClock);
	try {
		return await route({
			parts: [tier, work],
			state: routingState({
				role: c.role,
				description: c.description,
				task: c.text,
			}),
			attempts,
			fetchFn,
			clock: realClock,
			signal: limit.signal,
		});
	} finally {
		limit.disarm();
	}
}

const ENTER = ["\r", "\n"];
const CTRL_C = "\x03";
const BACKSPACE = "\x7f";

type Keystroke = { typed: string; end?: "enter" | "interrupt" };

function keystroke(typed: string, ch: string): Keystroke {
	if (ENTER.includes(ch)) return { typed, end: "enter" };
	if (ch === CTRL_C) return { typed, end: "interrupt" };
	return { typed: ch === BACKSPACE ? typed.slice(0, -1) : typed + ch };
}

function typeKey(
	stdin: NodeJS.ReadStream,
	holder: KeyHolder,
	url: string,
): Promise<string> {
	process.stderr.write(`${holder} API key for ${url}: `);
	stdin.setRawMode(true);
	stdin.resume();
	return new Promise((resolve) => {
		let typed = "";
		const finish = () => {
			stdin.off("data", onData);
			stdin.setRawMode(false);
			stdin.pause();
			process.stderr.write("\n");
		};
		const onData = (chunk: string) => {
			for (const ch of chunk) {
				const next = keystroke(typed, ch);
				typed = next.typed;
				if (!next.end) continue;
				finish();
				if (next.end === "interrupt") process.exit(EXIT_INTERRUPTED);
				return resolve(typed);
			}
		};
		stdin.on("data", onData);
	});
}

export async function readKey(
	stdin: NodeJS.ReadStream,
	holder: KeyHolder,
	url: string,
): Promise<string> {
	stdin.setEncoding("utf8");
	if (stdin.isTTY) return typeKey(stdin, holder, url);
	let text = "";
	for await (const chunk of stdin) text += chunk;
	return text.trim();
}

function hit(
	name: string,
	part: Decision["parts"][string] | undefined,
	expected: number,
	head: string,
): boolean {
	if (part?.level === expected) return true;
	const p = part ? formatProbability(part.probabilities[part.level]) : "none";
	console.log(
		`miss ${name}  expected ${expected}  got ${part?.level}  p=${p}  ${head}`,
	);
	return false;
}

/**
 * Runs the calibration and returns the process exit code. Returns EXIT_USAGE
 * for bad arguments, an unwritable record file or a missing key. Returns 0 when
 * tier and work agreement both meet the bar, and 1 otherwise. Expects the
 * key holder first, then an optional model and an optional --record file. Throws
 * when calibration.jsonl is unreadable or holds invalid JSON.
 */
export async function main(
	args: readonly string[],
	stdin: NodeJS.ReadStream,
	fetchFn: Fetch,
): Promise<number> {
	const at = args.indexOf("--record");
	const record = at === -1 ? undefined : args[at + 1];
	const positional = at === -1 ? args : args.toSpliced(at, 2);
	const [name, model, ...surplus] = positional;
	const asked = ASKED.find(({ holder }) => holder === name);
	if (!asked || surplus.length > 0 || (at !== -1 && !record)) {
		console.error(USAGE);
		return EXIT_USAGE;
	}
	// Fail before the paid requests, not after them.
	if (record) {
		try {
			writeFileSync(record, "");
		} catch (error) {
			console.error(`cannot write ${record}: ${(error as Error).message}`);
			return EXIT_USAGE;
		}
	}
	const { holder, choice } = asked;
	const key = await readKey(stdin, holder, rowOf(holder, choice).url);
	if (!key) {
		console.error(USAGE);
		return EXIT_USAGE;
	}
	const attempts = plan(choice, { [holder]: key }).map((a) =>
		model === undefined ? a : { ...a, model },
	);
	const cases: Case[] = readFileSync(
		new URL("../calibration.jsonl", import.meta.url),
		"utf8",
	)
		.split("\n")
		.filter((line) => line.trim() !== "")
		.map((line) => JSON.parse(line));

	// The alias resolves on the server, so the run records which model answered.
	const answeredBy = new Set<string>();
	let tierHits = 0;
	let workHits = 0;
	const rows: string[] = [];
	for (const c of cases) {
		const d = await runCase(c, attempts, fetchFn);
		const head = caseHead(c.text);
		if ("skipped" in d) {
			console.log(`skip  ${head}  ${d.skipped}`);
			continue;
		}
		if (d.model) answeredBy.add(d.model);
		const { tier: tierPart, work: workPart } = d.parts;
		rows.push(
			JSON.stringify({
				description: c.description,
				expected: c.expected,
				work: c.work,
				tier: tierPart?.probabilities,
				workProbabilities: workPart?.probabilities,
				model: d.model,
			}),
		);
		if (hit("tier", tierPart, c.expected, head)) tierHits += 1;
		if (hit("work", workPart, c.work, head)) workHits += 1;
	}

	if (record) writeFileSync(record, rows.map((r) => `${r}\n`).join(""));

	const agreement = (name: string, hits: number): number => {
		const a = hits / cases.length;
		console.log(
			`${name} agreement ${(a * PERCENT).toFixed(0)}% (${hits}/${cases.length}), bar ${AGREEMENT_BAR * PERCENT}%`,
		);
		return a;
	};
	console.log(
		`${model ?? rowOf(holder, choice).model} answered as ${[...answeredBy].join(", ") || "unknown"}`,
	);
	// A warning, not a failure: the agreement alone decides the exit code.
	for (const warning of fitWarnings(answeredBy)) console.error(warning);
	const tierOk = agreement("tier", tierHits) >= AGREEMENT_BAR;
	const workOk = agreement("work", workHits) >= AGREEMENT_BAR;
	return tierOk && workOk ? 0 : 1;
}

if (import.meta.main)
	process.exit(await main(process.argv.slice(2), process.stdin, fetch));
