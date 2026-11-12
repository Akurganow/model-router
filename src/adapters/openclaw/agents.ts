import { isRecord } from "../../core/part.ts";
import type { OpenClawConfig } from "./types.ts";

const DEFAULT_AGENT_ID = "main";
const MAX_ID_LENGTH = 64;
const VALID_ID = new RegExp(
	`^[a-z0-9][a-z0-9_-]{0,${MAX_ID_LENGTH - 1}}$`,
	"i",
);
const INVALID_CHARS = /[^a-z0-9_-]+/g;
const LEADING_DASHES = /^-+/;
const TRAILING_DASHES = /-+$/;

/**
 * OpenClaw's `normalizeAgentId` (packages/normalization-core/src/agent-id.ts in 2026.10.10):
 * trim and lower-case, replace invalid characters by dashes, and fall back to `main` for an empty result.
 */
export function normalizeAgentId(value: unknown): string {
	const trimmed = typeof value === "string" ? value.trim() : "";
	const lower = trimmed.toLowerCase();
	if (VALID_ID.test(trimmed)) return lower;
	const id = lower
		.replace(INVALID_CHARS, "-")
		.replace(LEADING_DASHES, "")
		.replace(TRAILING_DASHES, "")
		.slice(0, MAX_ID_LENGTH);
	return id === "" ? DEFAULT_AGENT_ID : id;
}

export const sameAgent = (a: string, b: string): boolean =>
	normalizeAgentId(a) === normalizeAgentId(b);

/**
 * The first entry whose normalised id matches, as OpenClaw's `resolveAgentEntry`
 * (src/agents/agent-scope-config.ts) finds it. The roster is `agents.entries`,
 * keyed by id, or else the older `agents.list` array of `{ id }` items
 * (`readAgentRosterProperty`, src/agents/agent-roster.ts); the first one present is the only one read.
 */
export function findAgent(
	config: OpenClawConfig | undefined,
	id: string | undefined,
): Record<string, unknown> | undefined {
	const agents = config?.agents;
	if (id === undefined || !isRecord(agents)) return undefined;
	const wanted = normalizeAgentId(id);
	const { entries, list } = agents;
	if (entries !== undefined) {
		if (!isRecord(entries)) return undefined;
		const key = Object.keys(entries).find(
			(candidate) =>
				isRecord(entries[candidate]) && normalizeAgentId(candidate) === wanted,
		);
		return key === undefined ? undefined : entries[key];
	}
	if (!Array.isArray(list)) return undefined;
	return list
		.filter(isRecord)
		.find(({ id: itemId }) => normalizeAgentId(itemId) === wanted);
}
