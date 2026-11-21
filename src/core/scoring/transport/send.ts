import {
	ABORTED,
	type Failure,
	isSuccess,
	NETWORK,
	TIMED_OUT,
} from "#core/scoring/failure.ts";
import type { Clock } from "#utils/clock.ts";
import {
	type HeaderReader,
	isRetried,
	RETRIES,
	retryDelayMs,
	TIMEOUT_MS,
} from "./retry.ts";

type FetchReply = {
	readonly status: number;
	readonly headers: HeaderReader;
	text(): Promise<string>;
};
type FetchInit = {
	readonly method: "POST";
	readonly headers: Readonly<Record<string, string>>;
	readonly body: string;
	readonly signal: AbortSignal;
};
export type Fetch = (url: string, init: FetchInit) => Promise<FetchReply>;
type Received = { readonly status: number; readonly text: string };

type Exchange = {
	readonly outcome: Received | Failure;
	readonly headers?: HeaderReader;
};

// The timer and the caller's signal both abort this request. The text of a 2xx reply is read
// under the same timer, so a body that never ends still times out. An error status stands even
// when its body is lost or stalls: the body is never used, and the status decides the fallback.
async function exchange(
	fetchFn: Fetch,
	url: string,
	request: Pick<FetchInit, "headers" | "body">,
	caller: AbortSignal,
	timeout: number,
	clock: Clock,
): Promise<Exchange> {
	if (caller.aborted) return { outcome: ABORTED };
	const controller = new AbortController();
	// Each await races against this, so a fetch or a body that ignores its signal still ends.
	const stopped = new Promise<never>((_, reject) => {
		controller.signal.addEventListener("abort", () => reject(), { once: true });
	});
	const timer = clock.after(timeout, () => controller.abort());
	// The fetch sees the caller's reason, so a routing limit differs from a cancel there too.
	const cancel = () => controller.abort(caller.reason);
	caller.addEventListener("abort", cancel, { once: true });
	try {
		const reply = await Promise.race([
			fetchFn(url, {
				method: "POST",
				headers: request.headers,
				body: request.body,
				signal: controller.signal,
			}),
			stopped,
		]);
		let text: string;
		try {
			text = await Promise.race([reply.text(), stopped]);
		} catch (error) {
			if (isSuccess(reply.status) || caller.aborted) throw error;
			return {
				outcome: { status: reply.status, text: "" },
				headers: reply.headers,
			};
		}
		return { outcome: { status: reply.status, text }, headers: reply.headers };
	} catch {
		// The error is dropped on purpose: a failure carries no cause, body or key.
		if (caller.aborted) return { outcome: ABORTED };
		return { outcome: controller.signal.aborted ? TIMED_OUT : NETWORK };
	} finally {
		timer.cancel();
		caller.removeEventListener("abort", cancel);
	}
}

// Waits `ms`, or until the caller aborts. The next `exchange` sees an abort and sends nothing,
// and `isRetried` does not retry an abort, so `send` returns it.
function pause(ms: number, caller: AbortSignal, clock: Clock): Promise<void> {
	if (caller.aborted) return Promise.resolve();
	return new Promise((resolve) => {
		const done = () => {
			timer.cancel();
			caller.removeEventListener("abort", done);
			resolve();
		};
		const timer = clock.after(ms, done);
		caller.addEventListener("abort", done, { once: true });
	});
}

// One provider's attempt: the first request, then up to `retries` more. Returns the last
// outcome, or aborted once the caller's signal fires. Sends nothing after an abort.
export async function send(
	fetchFn: Fetch,
	url: string,
	request: {
		readonly headers: Readonly<Record<string, string>>;
		readonly body: string;
	},
	options: {
		readonly signal: AbortSignal;
		readonly clock: Clock;
		readonly timeout?: number;
		readonly retries?: number;
	},
): Promise<Received | Failure> {
	const { signal, clock } = options;
	const timeout = options.timeout ?? TIMEOUT_MS;
	const retries = options.retries ?? RETRIES;
	for (let retry = 0; ; retry++) {
		const { outcome, headers } = await exchange(
			fetchFn,
			url,
			request,
			signal,
			timeout,
			clock,
		);
		if (retry >= retries || !isRetried(outcome)) return outcome;
		await pause(retryDelayMs(retry, headers), signal, clock);
	}
}
