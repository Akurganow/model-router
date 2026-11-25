import { KEY_HOLDERS } from "#core/providers/provider.ts";
import { MODEL_NAME_CHARS } from "#core/scoring/reply.ts";

// Reads a field of an object whose shape the client owns, which dot access refuses on an index signature.
export const get = (o: Record<string, unknown>, key: string): unknown => o[key];

export const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === "object" && v !== null && !Array.isArray(v);

// Lines that are not JSON objects are skipped, as a client may log between events.
export function jsonLines(text: string): Record<string, unknown>[] {
	const events: Record<string, unknown>[] = [];
	for (const line of text.split("\n")) {
		try {
			const event: unknown = JSON.parse(line);
			if (isRecord(event)) events.push(event);
		} catch {
			// Not an event.
		}
	}
	return events;
}

// The pattern starts right after the probabilities, because the failure tail has the same
// "<key holder> <word>" form. The model is optional: a reply may name none. cleanModel in
// src/core/scoring/reply.ts cuts the model to these characters.
const MODEL_SEGMENT = new RegExp(
	` · p=\\S+ · (?:${KEY_HOLDERS.join("|")})(?: (?<jev>[${MODEL_NAME_CHARS}]+))?`,
);

export function jevModel(line: string): string | null {
	const { jev } = MODEL_SEGMENT.exec(line)?.groups ?? {};
	return jev ?? null;
}
