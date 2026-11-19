import {
	ABORTED,
	type Failure,
	isFailure,
	NETWORK,
	TIMED_OUT,
} from "../failure.ts";
import {
	type HeaderReader,
	isRetriedStatus,
	RETRIES,
	retryDelayMs,
	TIMEOUT_MS,
} from "./retry.ts";

export type Reply = {
	readonly status: number;
	readonly headers: HeaderReader;
	text(): Promise<string>;
};
export type Request = {
	readonly method: "POST";
	readonly headers: Readonly<Record<string, string>>;
	readonly body: string;
	readonly signal: AbortSignal;
};
export type Fetch = (url: string, init: Request) => Promise<Reply>;
export type Sent = { readonly status: number; readonly text: string };

type Exchange = {
	readonly outcome: Sent | Failure;
	readonly headers?: HeaderReader;
};

// The timer and the caller's signal both abort this request. The reply text is read under the
// same timer, so a body that never ends still times out.
async function exchange(
	fetchFn: Fetch,
	url: string,
	request: Pick<Request, "headers" | "body">,
	caller: AbortSignal,
	timeout: number,
): Promise<Exchange> {
	const controller = new AbortController();
	// Each await races against this, so a fetch or a body that ignores its signal still ends.
	const stopped = new Promise<never>((_, reject) => {
		controller.signal.addEventListener("abort", () => reject(), { once: true });
	});
	// Nothing awaits it after the reply, so an abort then must not go unhandled.
	stopped.catch(() => undefined);
	let timedOut = false;
	const timer = setTimeout(() => {
		timedOut = true;
		controller.abort();
	}, timeout);
	// The fetch sees the caller's reason, so a routing limit differs from a cancel there too.
	const cancel = () => controller.abort(caller.reason);
	caller.addEventListener("abort", cancel, { once: true });
	try {
		const reply = await Promise.race([
			new Promise<Reply>((resolve) =>
				resolve(
					fetchFn(url, {
						method: "POST",
						headers: request.headers,
						body: request.body,
						signal: controller.signal,
					}),
				),
			),
			stopped,
		]);
		const text = await Promise.race([reply.text(), stopped]);
		return { outcome: { status: reply.status, text }, headers: reply.headers };
	} catch {
		// The error is dropped on purpose: a failure carries no cause, body or key.
		if (caller.aborted) return { outcome: ABORTED };
		return { outcome: timedOut ? TIMED_OUT : NETWORK };
	} finally {
		clearTimeout(timer);
		caller.removeEventListener("abort", cancel);
	}
}

// Waits `ms`: gives true when the time runs out, and false at once when the caller aborts first.
async function pause(ms: number, caller: AbortSignal): Promise<boolean> {
	const { promise, resolve } = Promise.withResolvers<boolean>();
	const onAbort = () => resolve(false);
	const timer = setTimeout(() => resolve(true), ms);
	caller.addEventListener("abort", onAbort, { once: true });
	try {
		return await promise;
	} finally {
		clearTimeout(timer);
		caller.removeEventListener("abort", onAbort);
	}
}

// Retried: a timeout, a connection failure, and the statuses that retry.ts names.
function retried(outcome: Sent | Failure): boolean {
	if (!isFailure(outcome)) return isRetriedStatus(outcome.status);
	return outcome.failure === "timed out" || outcome.failure === "network";
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
		readonly timeout?: number;
		readonly retries?: number;
	},
): Promise<Sent | Failure> {
	const { signal } = options;
	const timeout = options.timeout ?? TIMEOUT_MS;
	const retries = options.retries ?? RETRIES;
	for (let retry = 0; ; retry++) {
		if (signal.aborted) return ABORTED;
		const { outcome, headers } = await exchange(
			fetchFn,
			url,
			request,
			signal,
			timeout,
		);
		if (signal.aborted) return ABORTED;
		if (retry >= retries || !retried(outcome)) return outcome;
		if (!(await pause(retryDelayMs(retry, headers), signal))) return ABORTED;
	}
}
