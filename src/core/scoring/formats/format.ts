import type { RoutingState } from "#core/brief/brief.ts";
import type { Part, Probabilities } from "#core/parts/part.ts";
import type { Failure } from "#core/scoring/failure.ts";
import type { Usage } from "#core/scoring/reply.ts";

export type Answers = {
	// One pair per part.
	readonly answers: readonly (readonly [Part, Probabilities])[];
	// The model the reply names, raw; `ask` cleans it.
	readonly model: unknown;
	readonly usage: Usage | undefined;
};

// One scoring API's request body and the reading of its successful reply. `ask` handles an error
// status before `read`. A format maps its API's token counts into Usage.
// `body` may throw when a question cannot be serialised; `read` never throws.
export type Format = {
	readonly body: (
		parts: readonly Part[],
		state: RoutingState,
		model: string,
	) => string;
	readonly read: (parts: readonly Part[], text: string) => Answers | Failure;
};
