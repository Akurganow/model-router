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

// Replies recorded from each decisions endpoint, as the format tests read them.
export const OPENAI_REPLY = `{"model":"gpt-6-luna","answers":[{"type":"score","name":"tier","score":1.88,"probabilities":[{"value":0,"label":"0","probability":0.02},{"value":1,"label":"1","probability":0.08},{"value":2,"label":"2","probability":0.9}],"confidence":0.82},{"type":"score","name":"work","score":0.48,"probabilities":[{"value":0,"label":"0","probability":0.56},{"value":1,"label":"1","probability":0.4},{"value":2,"label":"2","probability":0.04}],"confidence":0.28}],"usage":{"input_tokens":506,"input_tokens_details":{"cached_tokens":0,"cache_write_tokens":0},"output_tokens":0,"output_tokens_details":{"reasoning_tokens":0},"total_tokens":506}}`;

// The recorded reply, without the fields that identify the request and its price.
export const OPENROUTER_REPLY = `{"model":"openai/gpt-6-luna-decisions-20261006","answers":{"tier":{"type":"score","score":1.93,"legend":{"0":"Lookup or transcription: the brief names the exact files to read or string to find, or holds the exact code, config or prose to write. It gives the commands to run and the check that proves the work done. No choice is left.","1":"Bounded judgment: the brief fixes the goal and a way to check the result. Check work against stated requirements, fix named defects, implement from a given plan or spec, or answer a question from a few named files.","2":"Open judgment: the brief leaves the approach open. Decide a design, create content with no plan or spec to follow, review a multi-file change for risks no checklist names, or debug with an unclear cause."},"probabilities":{"0":0.02,"1":0.03,"2":0.95},"confidence":0.9},"work":{"type":"score","score":0.49,"legend":{"0":"A short task: one or two mechanical steps in one place, nothing to diagnose, and the given command is the whole check.","1":"An ordinary task: reading or diagnosing code, a few steps or files, and a result to verify.","2":"A long or delicate task: many steps or files, hidden edge cases, or a wrong result that would look right."},"probabilities":{"0":0.54,"1":0.43,"2":0.03},"confidence":0.27}},"usage":{"input_tokens":488,"output_tokens":0},"provider":"OpenAI"}`;

export const GEMINI_REPLY = `{"answers":{"tier":{"confidence":0.8304925354943326,"score":1.8205809657551977,"probabilities":{"2":0.8304925354943326,"1":0.15959589476653246,"0":0.009911569739134969},"legend":{"1":"Bounded judgment: the brief fixes the goal and a way to check the result. Check work against stated requirements, fix named defects, implement from a given plan or spec, or answer a question from a few named files.","0":"Lookup or transcription: the brief names the exact files to read or string to find, or holds the exact code, config or prose to write. It gives the commands to run and the check that proves the work done. No choice is left.","2":"Open judgment: the brief leaves the approach open. Decide a design, create content with no plan or spec to follow, review a multi-file change for risks no checklist names, or debug with an unclear cause."},"type":"score"},"work":{"confidence":0.5572292731894598,"score":1.2755738063965518,"probabilities":{"2":0.35917226660354606,"0":0.08359846020699421,"1":0.5572292731894598},"legend":{"0":"A short task: one or two mechanical steps in one place, nothing to diagnose, and the given command is the whole check.","1":"An ordinary task: reading or diagnosing code, a few steps or files, and a result to verify.","2":"A long or delicate task: many steps or files, hidden edge cases, or a wrong result that would look right."},"type":"score"}},"usage":{"total_tokens":430,"total_input_tokens":430,"input_tokens_by_modality":[{"modality":"text","tokens":430}],"total_output_tokens":0}}`;
