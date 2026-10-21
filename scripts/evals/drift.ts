import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const FRONT_MATTER_FENCES = 2;
const BUNDLED_AGENT = "task.md";
const ROUTER_AGENTS = ["router_light", "router_mid", "router_heavy"];
const UNPACK_TIMEOUT_MS = 60_000;

export type Drift =
	| { agents: Record<string, "same" | "drifted"> }
	| { error: string };

// The body is what follows the closing fence of the front matter.
export function bodyOf(markdown: string): string {
	const lines = markdown.split("\n");
	let fences = 0;
	const body: string[] = [];
	for (const line of lines) {
		if (fences >= FRONT_MATTER_FENCES) body.push(line);
		else if (line === "---") fences++;
	}
	return body.join("\n").trim();
}

export const sameBody = (a: string, b: string): boolean =>
	bodyOf(a) === bodyOf(b);

// `omp agents unpack` writes into the home it runs under unless --dir is given, so it gets a throwaway home too.
function unpackBundled(
	env: Record<string, string>,
	dir: string,
): string | null {
	const home = mkdtempSync(join(tmpdir(), "evals-omp-home-"));
	try {
		const run = spawnSync("omp", ["agents", "unpack", "--dir", dir, "--json"], {
			env: { ...env, HOME: home },
			encoding: "utf8",
			timeout: UNPACK_TIMEOUT_MS,
		});
		return run.status === 0
			? null
			: `omp agents unpack exited ${run.status ?? run.error?.message}`;
	} finally {
		rmSync(home, { recursive: true, force: true });
	}
}

// Drift is recorded, never asserted: a new omp release may change the bundled body before the copies follow.
export function recordDrift(
	env: Record<string, string>,
	copiesDir: string,
): Drift {
	const dir = mkdtempSync(join(tmpdir(), "evals-omp-agents-"));
	try {
		const failure = unpackBundled(env, dir);
		if (failure) return { error: failure };
		const bundled = readFileSync(join(dir, BUNDLED_AGENT), "utf8");
		const agents: Record<string, "same" | "drifted"> = {};
		for (const name of ROUTER_AGENTS) {
			const copy = readFileSync(join(copiesDir, `${name}.md`), "utf8");
			agents[name] = sameBody(bundled, copy) ? "same" : "drifted";
		}
		return { agents };
	} catch (error) {
		return { error: error instanceof Error ? error.message : String(error) };
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}
