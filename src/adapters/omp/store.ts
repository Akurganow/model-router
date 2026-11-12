import { isRecord } from "../../utils/guards.ts";
import { nonEmpty } from "../../utils/text.ts";
import type { Routed } from "./effort.ts";

export const STORE_MAX = 64;

// A skipped item stores its line alone.
export type Stored = {
	readonly line: string;
	readonly routed?: Routed;
};
// The index numbers a spawn-time line.
type Taken = { readonly stored: Stored; readonly index: number };
type Entry = {
	readonly stored: Stored;
	readonly agent: string;
	readonly call: string;
	readonly index: number;
	readonly keys: Set<string>;
};

type Index = Map<string, Set<Entry>>;
type Collections = {
	readonly entries: Set<Entry>;
	readonly byKey: Index;
	readonly awaitingId: Index;
};

function link({ byKey }: Collections, entry: Entry, key: string): void {
	entry.keys.add(key);
	byKey.set(key, (byKey.get(key) ?? new Set()).add(entry));
}

function unlink({ byKey }: Collections, entry: Entry): void {
	for (const key of entry.keys) {
		const holders = byKey.get(key);
		holders?.delete(entry);
		if (holders?.size === 0) byKey.delete(key);
	}
	entry.keys.clear();
}

function markLearned({ awaitingId }: Collections, entry: Entry): void {
	const mine = awaitingId.get(entry.call);
	mine?.delete(entry);
	if (mine?.size === 0) awaitingId.delete(entry.call);
}

function remove(c: Collections, entry: Entry): void {
	unlink(c, entry);
	markLearned(c, entry);
	c.entries.delete(entry);
}

/**
 * Returns a store of decisions that wait for the spawn omp makes later. Every
 * key is bound to its call, so a key left by a call whose spawn never came
 * cannot reach the next call that reuses a name. The store holds at most
 * STORE_MAX entries and drops the oldest first. The add method keys a decision
 * by call and index, and by item name when the name is a non-blank string.
 */
export function createStore() {
	const c: Collections = {
		entries: new Set(),
		byKey: new Map(),
		awaitingId: new Map(),
	};
	return {
		// The index is the item's position in the call's task list, which progress reports as `index`.
		add(
			call: string,
			index: number,
			name: unknown,
			agent: string,
			stored: Stored,
		): void {
			const oldest = c.entries.values().next();
			if (c.entries.size >= STORE_MAX && !oldest.done) remove(c, oldest.value);
			const entry: Entry = { stored, agent, call, index, keys: new Set() };
			c.entries.add(entry);
			c.awaitingId.set(call, (c.awaitingId.get(call) ?? new Set()).add(entry));
			link(c, entry, `${call}:${index}`);
			if (typeof name === "string" && nonEmpty(name) !== undefined)
				link(c, entry, name);
		},

		// Progress names each running child. Its id is the spawn key in async mode, so it replaces the guesses.
		learn(call: string, progress: unknown): void {
			if (!Array.isArray(progress)) return;
			for (const item of progress) {
				const { index, id } = isRecord(item) ? item : {};
				if (typeof id !== "string" || id === "") continue;
				const entry = [...(c.awaitingId.get(call) ?? [])].find(
					(e) => e.index === index,
				);
				if (!entry) continue;
				unlink(c, entry);
				markLearned(c, entry);
				link(c, entry, id);
			}
		},

		// The ids stay: an async call ends before its children spawn.
		end(call: string): void {
			for (const entry of [...(c.awaitingId.get(call) ?? [])]) remove(c, entry);
		},

		// More than one match is ambiguous, and an ambiguous key takes nothing.
		// A decision binds to its agent: another agent takes nothing and leaves it stored.
		take(key: string | undefined, agent: string): Taken | undefined {
			const holders = key === undefined ? undefined : c.byKey.get(key);
			const [entry] = holders?.size === 1 ? holders : [];
			if (entry?.agent !== agent) return undefined;
			remove(c, entry);
			return { stored: entry.stored, index: entry.index };
		},
	};
}
