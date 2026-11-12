import type { Fetch } from "@typesafe-ai/sdk";

export const oneChunk = (bytes: Uint8Array) =>
	new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(bytes);
			controller.close();
		},
	});

// Bun gives the SDK a buffered reply whose body reads as already used. A stream-bodied copy reads fine.
export const streamedFetch: Fetch = async (url, init) => {
	const reply = await globalThis.fetch(url, init);
	const bytes = new TextEncoder().encode(await reply.text());
	return new Response(oneChunk(bytes), {
		status: reply.status,
		statusText: reply.statusText,
		headers: reply.headers,
	});
};
