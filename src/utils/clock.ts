export type Clock = {
	after: (ms: number, fn: () => void) => { cancel: () => void };
};

export const realClock: Clock = {
	after: (ms, fn) => {
		const timer = setTimeout(fn, ms);
		return { cancel: () => clearTimeout(timer) };
	},
};
