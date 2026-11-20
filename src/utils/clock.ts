// `after` returns its timer before it runs `fn`, for a delay of zero too: a caller may read the timer inside `fn`.
export type Clock = {
	after: (ms: number, fn: () => void) => { cancel: () => void };
};

export const realClock: Clock = {
	after: (ms, fn) => {
		const timer = setTimeout(fn, ms);
		return { cancel: () => clearTimeout(timer) };
	},
};
