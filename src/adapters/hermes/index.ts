import { FAILED } from "../../core/compose.ts";
import { realClock } from "../../utils/deadline.ts";
import { streamedFetch } from "../../utils/fetch.ts";
import { routeRequest, skip } from "./route.ts";

async function readStdin(): Promise<string> {
	const chunks: Buffer[] = [];
	for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
	return Buffer.concat(chunks).toString("utf8");
}

/**
 * Reads one JSON request from stdin and answers one JSON line on stdout. An
 * unreadable stdin or request gives the failed skip. Never throws.
 */
async function main(): Promise<string> {
	try {
		const raw: unknown = JSON.parse(await readStdin());
		const response = await routeRequest(raw, {
			fetchFn: streamedFetch,
			clock: realClock,
		});
		return JSON.stringify(response);
	} catch {
		return JSON.stringify(skip(FAILED));
	}
}

process.stdout.write(`${await main()}\n`, () => process.exit(0));
