const MODEL_CHARS_MAX = 40;

// The token counts of one reply.
export type Usage = {
	readonly input_tokens: number | null;
	readonly output_tokens: number | null;
};

// The characters a model name keeps, as the body of a regular expression class. The routing line
// shows the name, and the evals read it back with the same class.
export const MODEL_NAME_CHARS = "A-Za-z0-9._/:-";
const UNSAFE = new RegExp(`[^${MODEL_NAME_CHARS}]`, "g");

// The model name reaches the routing line, so it keeps safe characters only.
export const cleanModel = (model: unknown): string =>
	typeof model === "string"
		? model.replace(UNSAFE, "").slice(0, MODEL_CHARS_MAX)
		: "";
