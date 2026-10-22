// omp is not installed here. The adapter's entry imports this subpath and the bundle leaves it external.
declare module "@oh-my-pi/pi-coding-agent/config/registry" {
	export function lookup(
		id: string,
	): { get(scope: unknown): unknown } | undefined;
}
