import { isRecord } from "./model.ts";

export const STORE_MAX = 64;

export type Stored = {
	readonly role: string | undefined;
	readonly line: string;
};
type Entry = {
	readonly stored: Stored;
	readonly call: string;
	readonly index: number;
	readonly keys: Set<string>;
};

// A decision waits here for the spawn that omp makes later. Every key is bound to its call, so a
// key left by a call whose spawn never came cannot reach the next call that reuses a name.
export function createStore() {
	const entries = new Set<Entry>();
	const byKey = new Map<string, Set<Entry>>();
	// Entries that have not learned their id yet.
	const open = new Map<string, Set<Entry>>();

	const link = (entry: Entry, key: string) => {
		entry.keys.add(key);
		byKey.set(key, (byKey.get(key) ?? new Set()).add(entry));
	};
	const unlink = (entry: Entry) => {
		for (const key of entry.keys) {
			const holders = byKey.get(key);
			holders?.delete(entry);
			if (holders?.size === 0) byKey.delete(key);
		}
		entry.keys.clear();
	};
	const close = (entry: Entry) => {
		const mine = open.get(entry.call);
		mine?.delete(entry);
		if (mine?.size === 0) open.delete(entry.call);
	};
	const remove = (entry: Entry) => {
		unlink(entry);
		close(entry);
		entries.delete(entry);
	};

	return {
		// The index is the item's position in the call's task list, which progress reports as `index`.
		add(call: string, index: number, name: unknown, stored: Stored): void {
			const oldest = entries.values().next();
			if (entries.size >= STORE_MAX && !oldest.done) remove(oldest.value);
			const entry: Entry = { stored, call, index, keys: new Set() };
			entries.add(entry);
			open.set(call, (open.get(call) ?? new Set()).add(entry));
			link(entry, `${call}:${index}`);
			if (typeof name === "string" && name.trim() !== "") link(entry, name);
		},

		// Progress names each running child. Its id is the spawn key in async mode, so it replaces the guesses.
		learn(call: string, progress: unknown): void {
			if (!Array.isArray(progress)) return;
			for (const item of progress) {
				const { index, id } = isRecord(item) ? item : {};
				if (typeof id !== "string" || id === "") continue;
				const entry = [...(open.get(call) ?? [])].find(
					(e) => e.index === index,
				);
				if (!entry) continue;
				unlink(entry);
				close(entry);
				link(entry, id);
			}
		},

		// The ids stay: an async call ends before its children spawn.
		end(call: string): void {
			for (const entry of [...(open.get(call) ?? [])]) remove(entry);
		},

		// More than one match is ambiguous, and an ambiguous key takes nothing.
		take(key: string | undefined): Stored | undefined {
			const holders = key === undefined ? undefined : byKey.get(key);
			const [entry] = holders?.size === 1 ? holders : [];
			if (!entry) return undefined;
			remove(entry);
			return entry.stored;
		},
	};
}
