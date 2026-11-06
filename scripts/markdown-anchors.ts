import { anchorOf } from "./build/readme.ts";

const FENCE = /^(```|~~~)/;
const HEADING = /^#{1,6} (.+)$/;
/**
 * Lists the heading titles of a Markdown text. A line inside a fenced code
 * block, such as a shell comment, is not a heading.
 */
const headingsOf = (markdown: string): string[] => {
	let inFence = false;
	const titles: string[] = [];
	for (const line of markdown.split("\n")) {
		if (FENCE.test(line)) inFence = !inFence;
		const title = inFence ? undefined : HEADING.exec(line)?.[1];
		if (title !== undefined) titles.push(title);
	}
	return titles;
};

/**
 * Returns the anchors GitHub gives the headings. GitHub suffixes a repeated
 * heading's anchor with -1, -2 and so on.
 */
export const anchorsOf = (markdown: string): Set<string> => {
	const seen = new Map<string, number>();
	const anchors = new Set<string>();
	for (const title of headingsOf(markdown)) {
		const anchor = anchorOf(title);
		const count = seen.get(anchor) ?? 0;
		anchors.add(count === 0 ? anchor : `${anchor}-${count}`);
		seen.set(anchor, count + 1);
	}
	return anchors;
};
