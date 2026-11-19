import type { RoutingState } from "../../brief.ts";
import type { Part, Probabilities } from "../../part.ts";
import type { Failure } from "../failure.ts";

export type Answers = {
	// One pair per part, in the parts' order.
	readonly answers: readonly (readonly [Part, Probabilities])[];
	readonly model: unknown;
	readonly usage: unknown;
};

// One scoring API's request body and reply. `body` may throw when a question cannot be serialised; `read` never throws.
export type Format = {
	readonly body: (
		parts: readonly Part[],
		state: RoutingState,
		model: string,
	) => string;
	readonly read: (
		parts: readonly Part[],
		status: number,
		text: string,
	) => Answers | Failure;
};
