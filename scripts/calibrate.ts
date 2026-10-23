import { readFileSync } from "node:fs";
import type { Fetch } from "@typesafe-ai/sdk";
import { prepareBrief } from "../src/brief.ts";
import {
	type Decision,
	LIMIT_REACHED,
	ROUTING_LIMIT_MS,
	route,
	type Skipped,
} from "../src/compose.ts";
import { work } from "../src/effort.ts";
import { tier } from "../src/model.ts";
import { formatProbability } from "../src/part.ts";
import { type Attempt, HOSTS, type Provider, plan } from "../src/provider.ts";
import { EXIT_INTERRUPTED, EXIT_USAGE } from "./exit-codes.ts";

const AGREEMENT_BAR = 0.85;
const CASE_HEAD_CHARS = 60;
const PERCENT = 100;
const NAMES: Readonly<Record<Provider, string>> = {
	typesafe: "TypeSafe",
	openrouter: "OpenRouter",
};
const USAGE = `usage: node scripts/calibrate.ts <typesafe|openrouter> [model]  (typesafe sends the cases to ${HOSTS.typesafe}, openrouter to ${HOSTS.openrouter}; enter that host's API key at the prompt, or pipe it on stdin; model defaults to jev-latest)`;

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
	keys: Readonly<Partial<Record<Provider, string>>>,
	fetchFn: Fetch,
): Promise<Decision | Skipped> {
	const limit = new AbortController();
	const timer = setTimeout(() => limit.abort(LIMIT_REACHED), ROUTING_LIMIT_MS);
	try {
		return await route({
			parts: [tier, work],
			state: {
				role: c.role,
				description: c.description,
				task: prepareBrief(c.text),
			},
			attempts,
			keys,
			fetchFn,
			signal: limit.signal,
		});
	} finally {
		clearTimeout(timer);
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
	provider: Provider,
): Promise<string> {
	process.stderr.write(`${NAMES[provider]} API key for ${HOSTS[provider]}: `);
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
	provider: Provider,
): Promise<string> {
	stdin.setEncoding("utf8");
	if (stdin.isTTY) return typeKey(stdin, provider);
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

export async function main(
	args: readonly string[],
	stdin: NodeJS.ReadStream,
	fetchFn: Fetch,
): Promise<number> {
	const [provider, model, ...surplus] = args;
	if (
		(provider !== "typesafe" && provider !== "openrouter") ||
		surplus.length > 0
	) {
		console.error(USAGE);
		return EXIT_USAGE;
	}
	const key = await readKey(stdin, provider);
	if (!key) {
		console.error(USAGE);
		return EXIT_USAGE;
	}
	const attempts = plan(provider, {
		typesafe: provider === "typesafe",
		openrouter: provider === "openrouter",
	}).map((a) => ({ ...a, model: model ?? a.model }));
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
	for (const c of cases) {
		const d = await runCase(c, attempts, { [provider]: key }, fetchFn);
		const head = caseHead(c.text);
		if ("skipped" in d) {
			console.log(`skip  ${head}  ${d.skipped}`);
			continue;
		}
		if (d.model) answeredBy.add(d.model);
		const { tier: tierPart, work: workPart } = d.parts;
		if (hit("tier", tierPart, c.expected, head)) tierHits += 1;
		if (hit("work", workPart, c.work, head)) workHits += 1;
	}

	const agreement = (name: string, hits: number): number => {
		const a = hits / cases.length;
		console.log(
			`${name} agreement ${(a * PERCENT).toFixed(0)}% (${hits}/${cases.length}), bar ${AGREEMENT_BAR * PERCENT}%`,
		);
		return a;
	};
	console.log(
		`${attempts[0]?.model} answered as ${[...answeredBy].join(", ") || "unknown"}`,
	);
	const tierOk = agreement("tier", tierHits) >= AGREEMENT_BAR;
	const workOk = agreement("work", workHits) >= AGREEMENT_BAR;
	return tierOk && workOk ? 0 : 1;
}

if (import.meta.main)
	process.exit(await main(process.argv.slice(2), process.stdin, fetch));
