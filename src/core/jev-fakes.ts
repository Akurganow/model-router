import { oneChunk } from "../utils/fetch.ts";

/**
 * Returns probabilities that give the level 0.9 and each other level 0.05.
 */
const spread = (level: number) => ({
	0: level === 0 ? 0.9 : 0.05,
	1: level === 1 ? 0.9 : 0.05,
	2: level === 2 ? 0.9 : 0.05,
});

const score = (level: number) => ({
	type: "score",
	probabilities: spread(level),
});

/**
 * Returns the reply body of the Jev API: a tier answer, plus a work answer when
 * work is given.
 */
export const jevAnswer = (tier: number, work?: number) => ({
	model: "jev-1.14.0",
	usage: { input_tokens: 812, output_tokens: 9 },
	answers: {
		tier: score(tier),
		...(work === undefined ? {} : { work: score(work) }),
	},
});

/**
 * Returns a stream-bodied reply, as the SDK reads it under Bun. A string body
 * goes out as is and any other body as JSON. The headers extend the JSON
 * content type and replace it when they set one.
 */
export function streamed(
	status: number,
	body: unknown,
	headers: Record<string, string> = {},
): Response {
	const bytes = new TextEncoder().encode(
		typeof body === "string" ? body : JSON.stringify(body),
	);
	return new Response(oneChunk(bytes), {
		status,
		headers: { "content-type": "application/json", ...headers },
	});
}
