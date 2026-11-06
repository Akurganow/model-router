import type { Fetch } from "@typesafe-ai/sdk";
import { jevAnswer, streamed } from "./jev-fakes.ts";

// What one scripted Jev call answers. "hang" holds the request until its signal aborts.
export type Reply =
	| "hang"
	| { readonly levels: { readonly tier: number; readonly work: number } }
	| { readonly status: number }
	| { readonly body: unknown };
export type Step = { readonly host: string; readonly reply: Reply };

// Like the real fetch, it rejects with the signal's reason, even when the abort came first.
const hold = (signal: AbortSignal | null | undefined): Promise<never> =>
	new Promise((_, reject) => {
		if (signal?.aborted) reject(signal.reason);
		signal?.addEventListener("abort", () => reject(signal.reason), {
			once: true,
		});
	});

function answer(reply: Exclude<Reply, "hang">): Response {
	if ("levels" in reply)
		return streamed(200, jevAnswer(reply.levels.tier, reply.levels.work));
	if ("status" in reply) return streamed(reply.status, {});
	return streamed(200, reply.body);
}

/**
 * A fetch that answers its calls from the steps in order. `hosts` lists the host
 * of every call, and `bodies` the parsed request bodies. A call past the last
 * step rejects. `onHang` runs when a call hangs, so a test can run the clock.
 */
export function createScriptedJev(steps: readonly Step[], onHang: () => void) {
	const hosts: string[] = [];
	const bodies: unknown[] = [];
	const fetch: Fetch = async (url, init) => {
		init?.signal?.throwIfAborted();
		hosts.push(new URL(String(url)).host);
		bodies.push(JSON.parse(String(init?.body)));
		const step = steps[hosts.length - 1];
		if (step === undefined) throw new Error("no step left for this call");
		if (step.reply !== "hang") return answer(step.reply);
		onHang();
		return hold(init?.signal);
	};
	return { fetch, hosts, bodies };
}
