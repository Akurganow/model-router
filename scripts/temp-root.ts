import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach } from "node:test";

export type TempRoot = {
	readonly root: string;
	put(path: string, text: string): void;
	read(path: string): string;
};

// A fresh folder for each test, seeded before the test runs and removed after it.
export function useTempRoot(
	prefix: string,
	seed: (put: TempRoot["put"]) => void = () => {},
): TempRoot {
	let root = "";
	const put = (path: string, text: string) => {
		mkdirSync(dirname(join(root, path)), { recursive: true });
		writeFileSync(join(root, path), text);
	};
	const read = (path: string) => readFileSync(join(root, path), "utf8");
	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), prefix));
		seed(put);
	});
	afterEach(() => rmSync(root, { recursive: true, force: true }));
	return {
		get root() {
			return root;
		},
		put,
		read,
	};
}
