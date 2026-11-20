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
 * Returns the reply body of the System One API: a tier answer, plus a work answer when
 * work is given.
 */
export const systemOneAnswer = (tier: number, work?: number) => ({
	model: "jev-1.14.0",
	usage: { input_tokens: 812, output_tokens: 9 },
	answers: {
		tier: score(tier),
		...(work === undefined ? {} : { work: score(work) }),
	},
});

/**
 * Returns a reply with the status. A string body goes out as is and any other
 * body as JSON. The headers extend the JSON content type and replace it when
 * they set one.
 */
export function scoringReply(
	status: number,
	body: unknown,
	headers: Record<string, string> = {},
): Response {
	const text = typeof body === "string" ? body : JSON.stringify(body);
	return new Response(text, {
		status,
		headers: { "content-type": "application/json", ...headers },
	});
}

/** Returns a JSON reply with the status (200 by default) whose headers arrive and whose body never does. */
export function stalledReply(status = 200): Response {
	return new Response(new ReadableStream<Uint8Array>(), {
		status,
		headers: { "content-type": "application/json" },
	});
}

/** Returns a reply with the status whose headers arrive and whose body read rejects. */
export function brokenReply(status: number): Response {
	return new Response(
		new ReadableStream<Uint8Array>({
			start(controller) {
				controller.error(new TypeError("body lost"));
			},
		}),
		{ status, headers: { "content-type": "application/json" } },
	);
}
