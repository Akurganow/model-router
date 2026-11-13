import { errorText } from "../utils/error.ts";
import {
	LABEL_SEPARATOR,
	NO_ANSWER,
	NOT_OFFERED,
	unchanged,
	unchangedBy,
} from "./settings.ts";
import {
	SLOT_SETTINGS,
	SLOTS,
	type Slot,
	type SlotSetting,
	slotLine,
	slotSetting,
} from "./slots.ts";

/**
 * One model the harness lists. The id is in the harness's own form. Prices are
 * USD per million tokens and the context is in tokens. An adapter leaves a
 * number out when its harness does not know it.
 */
export type Listed = {
	readonly id: string;
	readonly input?: number;
	readonly output?: number;
	readonly context?: number;
};

/** The plugin's own way to set a slot. A harness without a dialog has none. */
export type Writer = {
	/** Returns a reason to refuse this caller, or undefined to go on. */
	authorize(): string | undefined;
	/** The slot's name in its report line. */
	name(slot: Slot): string;
	/** The configured value of the slot, or undefined when it is unset. */
	current(slot: Slot): Promise<string | undefined>;
	select(
		slot: Slot,
		question: string,
		options: string[],
	): Promise<string | undefined>;
	/** Writes the id in the harness's form and returns the value now configured. */
	write(slot: Slot, id: string): Promise<string | undefined>;
};

export type ModelPort = {
	/** Lists from the harness's own data only, and rejects when it cannot say. */
	list(): Promise<readonly Listed[]>;
	/** How the person sets the slot by hand. */
	help(slot: Slot): string;
	writer: Writer | null;
};

const MODELS = "models";
const MAX_CANDIDATES = 4;
const SHOW_ALL = "Show the whole list";
// A listed id is untrusted text that reaches the agent and the dialog.
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/+-]{0,99}$/;

const significant = new Intl.NumberFormat("en-US", {
	maximumSignificantDigits: 3,
	useGrouping: false,
});
const compact = new Intl.NumberFormat("en-US", {
	notation: "compact",
	maximumSignificantDigits: 3,
});

const known = (value: unknown): value is number =>
	typeof value === "number" && Number.isFinite(value) && value >= 0;

function detail({ input, output, context }: Listed): string | undefined {
	const prices = [
		known(input) ? `$${significant.format(input)} in` : undefined,
		known(output) ? `$${significant.format(output)} out` : undefined,
	].filter((part) => part !== undefined);
	const parts = [
		prices.length > 0 ? `${prices.join(", ")} per 1M tokens` : undefined,
		known(context) ? `${compact.format(context)} context` : undefined,
	].filter((part) => part !== undefined);
	return parts.length > 0 ? parts.join(", ") : undefined;
}

const usable = (listed: readonly Listed[]): Listed[] =>
	listed.filter(
		(model) => typeof model.id === "string" && ID_PATTERN.test(model.id),
	);

export const isModelSetting = (
	name: unknown,
): name is SlotSetting | typeof MODELS =>
	name === MODELS || SLOT_SETTINGS.some((setting) => setting === name);

/** Returns the text the agent reads for the models setting. */
export function listing(listed: readonly Listed[]): string {
	const models = usable(listed);
	return [
		`models the person can run: ${models.length}`,
		...models.map((model) => {
			const words = detail(model);
			return words === undefined ? `- ${model.id}` : `- ${model.id} (${words})`;
		}),
	].join("\n");
}

const unavailable = (err: unknown): string =>
	`models unavailable: ${errorText(err)}`;

const label = (model: Listed): string => {
	const words = detail(model);
	return words === undefined
		? model.id
		: `${model.id}${LABEL_SEPARATOR}${words}`;
};

// A dialog that throws or rejects gave no answer.
async function ask(
	writer: Writer,
	slot: Slot,
	question: string,
	options: string[],
): Promise<string | undefined> {
	try {
		return await writer.select(slot, question, options);
	} catch {
		return undefined;
	}
}

async function choose(
	port: ModelPort,
	writer: Writer,
	slot: Slot,
	candidates: unknown,
): Promise<string> {
	const setting = slotSetting(slot);
	const refusal = writer.authorize();
	if (refusal !== undefined) return unchanged(setting, refusal);
	let models: Listed[];
	try {
		models = usable(await port.list());
	} catch (err) {
		return unchanged(setting, unavailable(err));
	}
	if (models.length === 0) return unchanged(setting, listing(models));
	let current: string | undefined;
	try {
		current = await writer.current(slot);
	} catch (err) {
		return unchangedBy(setting, err);
	}
	const question = `Which model should the ${slot} level run? ${setting} is ${current ?? "unset"} now.`;
	const first: Listed[] = [];
	for (const id of Array.isArray(candidates) ? candidates : []) {
		const model = models.find((listed) => listed.id === id);
		if (model !== undefined && !first.includes(model)) first.push(model);
		if (first.length === MAX_CANDIDATES) break;
	}
	let answer = await ask(writer, slot, question, [
		...first.map(label),
		SHOW_ALL,
	]);
	let from = first;
	if (answer === SHOW_ALL) {
		answer = await ask(writer, slot, question, models.map(label));
		from = models;
	}
	if (answer === undefined) return unchanged(setting, NO_ANSWER);
	const model = from.find((listed) => label(listed) === answer);
	if (model === undefined) return unchanged(setting, NOT_OFFERED);
	try {
		return slotLine(writer.name(slot), await writer.write(slot, model.id));
	} catch (err) {
		return unchangedBy(setting, err);
	}
}

/**
 * Answers the models setting and the slot settings, and returns undefined for
 * any other setting. A slot setting returns the user path when the harness has
 * no writer. With a writer the person picks in the plugin's dialog from the
 * agent's candidates or the whole list, and the plugin writes. A failed list,
 * read, dialog or write ends in a line, never in a rejection.
 */
export async function runModels(
	port: ModelPort,
	params: { readonly setting?: unknown; readonly candidates?: unknown },
): Promise<string | undefined> {
	const { setting, candidates } = params;
	if (setting === MODELS) {
		try {
			return listing(await port.list());
		} catch (err) {
			return unavailable(err);
		}
	}
	const slot = SLOTS.find((each) => slotSetting(each) === setting);
	if (slot === undefined) return undefined;
	return port.writer === null
		? port.help(slot)
		: choose(port, port.writer, slot, candidates);
}

/** The sentences the settings tool adds for the models and the slot settings. */
export const modelToolSentences = (writable: boolean): string =>
	[
		"With models it returns the models the person can run.",
		...(writable
			? [
					"For a model setting, pass up to four ids from models as candidates: the dialog offers them and an entry that shows the whole list.",
				]
			: []),
	].join(" ");

export const CANDIDATES_DESCRIPTION =
	"Up to four model ids from the models list. The person picks in the plugin's dialog. Never a value to write.";
