import { type JsonObject, oneLine, type Rendered, serialize } from "./json.ts";
import { OMP_OUTPUTS } from "./outputs.ts";
import type { Source } from "./source.ts";
import { SETTING_VALUES, VALUE_SETTINGS } from "./values.ts";

const settings = (source: Source): JsonObject =>
	Object.fromEntries(
		VALUE_SETTINGS.map((setting) => [
			setting,
			{
				type: source.omp.settingType,
				description: source.options[setting].descriptions.omp,
				values: [...SETTING_VALUES[setting]],
				default: source.options[setting].default,
			},
		]),
	);

const manifest = (source: Source): JsonObject => ({
	name: source.omp.package.name,
	version: source.version,
	private: source.omp.package.private,
	type: source.omp.package.type,
	description: source.descriptions.omp.manifest,
	license: source.license,
	homepage: source.homepage,
	repository: source.repository,
	omp: {
		extensions: [...source.omp.package.extensions],
		settings: settings(source),
	},
});

const catalogue = (source: Source): JsonObject => ({
	name: source.name,
	owner: oneLine({ name: source.author.name }),
	description: source.descriptions.omp.catalogue,
	plugins: [
		{
			name: source.name,
			source: source.omp.catalogueSource,
			version: source.version,
			homepage: source.homepage,
			privacyPolicyUrl: source.privacyPolicyUrls.omp,
		},
	],
});

export const renderOmp = (source: Source): Rendered[] => [
	{ path: OMP_OUTPUTS.manifest, text: serialize(manifest(source)) },
	{ path: OMP_OUTPUTS.catalogue, text: serialize(catalogue(source)) },
];
