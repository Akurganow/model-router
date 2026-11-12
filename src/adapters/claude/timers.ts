export type Timer = { cancel(): void };
type After = (ms: number, fn: () => void) => Timer;

let after: After | undefined;

export function installTimers(implementation: After): void {
	after = implementation;
}

function installed(name: string): After {
	if (after === undefined)
		throw new Error(
			`${name} was called before installTimers; call installTimers with the $.clock.after wrapper at the start of the hook`,
		);
	return after;
}

export function setTimeout(fn: () => void, ms: number): Timer {
	return installed("setTimeout")(ms, fn);
}

export function clearTimeout(timer: Timer | undefined): void {
	installed("clearTimeout");
	timer?.cancel();
}
