import { readFileSync } from "node:fs";
import { isRecord } from "../../core/part.ts";

// The name of the catalogue package. Reads fall back to it when the installed name is unreadable.
export const FALLBACK_NAME = "model-router-omp";

/**
 * Returns the name in the package.json one directory above moduleUrl, or
 * undefined when that file is unreadable, invalid or has no non-empty string
 * name. Never throws. omp keys plugin settings by the name of the installed
 * package.json and passes an extension no name. The bundle sits in extension/
 * beside that file. Relative resolution drops the ?mtime= query omp adds.
 */
export function readInstalledName(moduleUrl: string | URL): string | undefined {
	try {
		const manifest: unknown = JSON.parse(
			readFileSync(new URL("../package.json", moduleUrl), "utf8"),
		);
		const { name } = isRecord(manifest) ? manifest : {};
		return typeof name === "string" && name !== "" ? name : undefined;
	} catch {
		return undefined;
	}
}
