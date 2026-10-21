import { spawnSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { ADAPTERS } from "./adapters.ts";
import { type Case, check } from "./cases.ts";
import { type Drift, recordDrift } from "./drift.ts";
import { clientEnv, normalisePaths, scrub, TYPESAFE_KEY } from "./scrub.ts";
import type { Evidence } from "./types.ts";

const CASE_TIMEOUT_MS = 600_000;
const VERSION_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;
const MS_PER_SECOND = 1000;

export type CaseResult = {
	case: string;
	client: string;
	clientVersion: string;
	model: string;
	date: string;
	durationS: number;
	exitCode: number | null;
	evidence: Evidence;
	failures: string[];
	passed: boolean;
	drift?: Drift;
	stdout: string;
	stderr: string;
};

const ENV_PLACEHOLDERS: readonly (readonly [string, string])[] = [
	["RUNNER_TEMP", "<runner-temp>"],
	["GITHUB_WORKSPACE", "<workspace>"],
];

function pathRoots(workDir: string): [string, string][] {
	const roots: [string, string][] = [
		[workDir, "<work>"],
		[realpathSync(workDir), "<work>"],
		[tmpdir(), "<tmp>"],
		[homedir(), "<home>"],
	];
	for (const [name, placeholder] of ENV_PLACEHOLDERS) {
		const value = process.env[name];
		if (value) roots.push([value, placeholder]);
	}
	return roots;
}

export function missingKeys(c: Case, env: NodeJS.ProcessEnv): string[] {
	return [c.keyEnv, TYPESAFE_KEY].filter((name) => !env[name]);
}

function runClient(c: Case, workDir: string, env: Record<string, string>) {
	const adapter = ADAPTERS[c.client];
	if (!adapter) throw new Error(`unknown client ${c.client}`);
	const [bin = "", ...args] = adapter.command(c.prompt, c.model);
	const run = spawnSync(bin, args, {
		cwd: workDir,
		env,
		encoding: "utf8",
		timeout: CASE_TIMEOUT_MS,
		maxBuffer: MAX_OUTPUT_BYTES,
		stdio: ["ignore", "pipe", "pipe"],
	});
	const version = spawnSync(bin, ["--version"], {
		env,
		encoding: "utf8",
		timeout: VERSION_TIMEOUT_MS,
	});
	return { adapter, run, version: version.stdout.trim() };
}

export function runCase(c: Case, copiesDir: string): CaseResult {
	const workDir = mkdtempSync(join(tmpdir(), "evals-work-"));
	try {
		for (const [name, content] of Object.entries(c.files))
			writeFileSync(
				join(workDir, name),
				`${JSON.stringify(content, null, 2)}\n`,
			);
		const env = clientEnv(process.env, [c.keyEnv]);
		const started = Date.now();
		const { adapter, run, version } = runClient(c, workDir, env);
		const durationS = Math.round((Date.now() - started) / MS_PER_SECOND);
		const stdout = run.stdout ?? "";
		const stderr = run.stderr ?? "";
		const evidence = adapter.parse({ stdout, stderr });
		const failures = check(c, evidence);
		if (run.error) failures.push(`client failed to run: ${run.error.message}`);
		else if (run.status !== 0) failures.push(`client exited ${run.status}`);
		const clean = (text: string) =>
			normalisePaths(scrub(text, process.env), pathRoots(workDir));
		const result: CaseResult = {
			case: c.id,
			client: c.client,
			clientVersion: version,
			model: c.model,
			date: new Date().toISOString(),
			durationS,
			exitCode: run.status,
			evidence,
			failures,
			passed: failures.length === 0,
			stdout: clean(stdout),
			stderr: clean(stderr),
		};
		if (c.record.includes("drift")) result.drift = recordDrift(env, copiesDir);
		return JSON.parse(clean(JSON.stringify(result))) as CaseResult;
	} finally {
		rmSync(workDir, { recursive: true, force: true });
	}
}
