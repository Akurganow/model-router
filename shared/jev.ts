import { TransportError } from "./core.ts";

// Fixed on purpose: no variable or setting may send the key anywhere else.
export const JEV_ENDPOINT = "https://api.typesafe.ai/v1/systemone";

type Reply = { ok: boolean; status: number; text(): Promise<string> };
export type FetchLike = (
	url: string,
	init: {
		method: "POST";
		headers: Record<string, string>;
		body: string;
		signal: AbortSignal;
		redirect: "error";
	},
) => Promise<Reply>;

// The caller owns the deadline and aborts the signal when it passes.
export async function postJev(
	fetchFn: FetchLike,
	apiKey: string,
	body: string,
	signal: AbortSignal,
): Promise<string> {
	const failed = () =>
		new TransportError(signal.aborted ? "timeout" : "network");
	let reply: Reply;
	try {
		reply = await fetchFn(JEV_ENDPOINT, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
			},
			body,
			signal,
			// The bearer key must never follow a redirect to another host.
			redirect: "error",
		});
	} catch {
		throw failed();
	}
	if (!reply.ok) throw new TransportError("http", { status: reply.status });
	try {
		return await reply.text();
	} catch {
		throw failed();
	}
}
