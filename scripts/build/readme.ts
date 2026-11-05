import { README_OUTPUT } from "./outputs.ts";
import type { Install, Source } from "./source.ts";

const START = "<!-- install:start -->";
const END = "<!-- install:end -->";

// The marketplace argument is the repository's owner and name, as in a GitHub address.
const marketplaceArgument = (source: Source): string =>
	new URL(source.repository).pathname.slice(1);

// The catalogue and the plugin carry the same name, so the id repeats it.
export const pluginId = (source: Source): string =>
	`${source.name}@${source.name}`;

export const installCommands = (
	source: Source,
	install: Install,
	marketplace: string = marketplaceArgument(source),
): string[] =>
	install.commands.map((command) =>
		command
			.replaceAll("{marketplace}", marketplace)
			.replaceAll("{plugin}", pluginId(source)),
	);

// GitHub's heading anchor: lower case, punctuation dropped, spaces as hyphens.
export const anchorOf = (heading: string): string =>
	heading
		.toLowerCase()
		.replace(/[^\p{L}\p{N} _-]/gu, "")
		.replaceAll(" ", "-");

// The hand-written setup steps sit under "Set up <harness>" after the region.
const setupLine = ({ heading }: Install): string => {
	const setup = `Set up ${heading}`;
	return `[${setup}](#${anchorOf(setup)}) has the next steps.`;
};

const ciLine = ({ ciSystems }: Install): string =>
	ciSystems.length === 0
		? "CI does not install it."
		: `CI installs it on ${ciSystems.join(" and ")}.`;

const section = (source: Source, install: Install): string => {
	const { publisher, title, url } = install.source;
	return [
		`### ${install.heading}`,
		"",
		"```sh",
		...installCommands(source, install),
		"```",
		"",
		`Source: ${publisher}, [${title}](${url}).`,
		"",
		ciLine(install),
		"",
		setupLine(install),
	].join("\n");
};

const occurrences = (text: string, marker: string): number =>
	text.split(marker).length - 1;

/**
 * Throws, naming the README and the marker, unless each install marker appears
 * exactly once and the start marker comes first.
 */
function checkMarkers(readme: string): void {
	for (const marker of [START, END]) {
		const count = occurrences(readme, marker);
		if (count === 0)
			throw new Error(
				`${README_OUTPUT}: the marker ${marker} is missing. Add it on its own line in the Install section.`,
			);
		if (count > 1)
			throw new Error(
				`${README_OUTPUT}: the marker ${marker} appears ${count} times. Keep one.`,
			);
	}
	if (readme.indexOf(END) < readme.indexOf(START))
		throw new Error(
			`${README_OUTPUT}: ${END} comes before ${START}. Swap them.`,
		);
}

// Returns the README with the text between the install markers replaced.
export function renderReadme(readme: string, source: Source): string {
	checkMarkers(readme);
	const body = [source.claude.install, source.omp.install]
		.map((install) => section(source, install))
		.join("\n\n");
	const head = readme.slice(0, readme.indexOf(START) + START.length);
	const tail = readme.slice(readme.indexOf(END));
	return `${head}\n\n${body}\n\n${tail}`;
}
