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

const AGREEMENT_BAR = 0.85;
const CASE_HEAD_CHARS = 60;

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
	model: string,
	apiKey: string,
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
			model,
			apiKey,
			fetchFn,
			signal: limit.signal,
		});
	} finally {
		clearTimeout(timer);
	}
}

const readKey = async (): Promise<string> => {
	const { stdin } = process;
	stdin.setEncoding("utf8");
	if (!stdin.isTTY) {
		let text = "";
		for await (const chunk of stdin) text += chunk;
		return text.trim();
	}
	process.stderr.write("TypeSafe API key: ");
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
				if (ch === "\r" || ch === "\n") {
					finish();
					resolve(typed);
					return;
				}
				if (ch === "\x03") {
					finish();
					process.exit(130);
				}
				typed = ch === "\x7f" ? typed.slice(0, -1) : typed + ch;
			}
		};
		stdin.on("data", onData);
	});
};

function hit(
	name: string,
	part: Decision["parts"][string] | undefined,
	expected: number,
	head: string,
): boolean {
	if (part?.level === expected) return true;
	const p = part ? part.probabilities[part.level].toFixed(2) : "none";
	console.log(
		`miss ${name}  expected ${expected}  got ${part?.level}  p=${p}  ${head}`,
	);
	return false;
}

async function main(): Promise<number> {
	const model = process.argv[2] ?? "jev-latest";
	const key = await readKey();
	if (!key) {
		console.error(
			"usage: node scripts/calibrate.ts [model]  (enter the TypeSafe API key at the prompt, or pipe it on stdin; model defaults to jev-latest)",
		);
		return 2;
	}
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
		const d = await runCase(c, model, key, fetch);
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
			`${name} agreement ${(a * 100).toFixed(0)}% (${hits}/${cases.length}), bar ${AGREEMENT_BAR * 100}%`,
		);
		return a;
	};
	console.log(
		`${model} answered as ${[...answeredBy].join(", ") || "unknown"}`,
	);
	const tierOk = agreement("tier", tierHits) >= AGREEMENT_BAR;
	const workOk = agreement("work", workHits) >= AGREEMENT_BAR;
	return tierOk && workOk ? 0 : 1;
}

if (import.meta.main) process.exit(await main());
