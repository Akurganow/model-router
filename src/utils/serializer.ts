/**
 * Returns a function that runs each job after the one before it settles.
 * A job that fails does not stop the jobs queued behind it.
 */
export function serializer() {
	let tail: Promise<unknown> = Promise.resolve();
	return <T>(job: () => Promise<T>): Promise<T> => {
		const run = tail.then(job);
		tail = run.catch(() => undefined);
		return run;
	};
}
