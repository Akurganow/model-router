# Changelog
All notable changes to this project will be documented in this file. See [conventional commits](https://www.conventionalcommits.org/) for commit guidelines.

- - -

## v0.7.2 - 2026-10-14
#### Bug Fixes
- install no dev tools onto users' machines (0642945)
#### Build system
- format package.json (4533970)
- refuse an npm older than 11.10.0 (b4a3e1a)
- pin the actions to their latest releases and widen the window to 14 days (dde86aa)
- gate dependencies behind a 7-day window and audit them in CI (6c14e8e)
#### Continuous Integration
- cache the policy verdict by the plugin folder's tree (e00ba18)
- reflow the dependency review comment (21dc0dc)
- fail the dependency review on the unknown scope too (1902449)

- - -


## v0.7.1 - 2026-10-13
#### Bug Fixes
- end the Jev wait when the dispatch is abandoned (347b93c)

- - -


## v0.7.0 - 2026-10-13
#### Features
- disclose the TypeSafe upload in the plugin description (a26f6ed)
#### Documentation
- say the verdict stays local and name the CI gates (2664723)
#### Build system
- type-check and lint with strict TypeScript and Biome (c01e935)
#### Continuous Integration
- scan each plugin tree once and gate on the cached verdict (76f90f3)
- validate the plugin with --strict (e75b024)
- push releases with the release deploy key (1248715)
- fail the policy job when the scan returns no verdict (f661ad7)
- run Anthropic's plugin policy scan on every pull request (35a80d4)
- fail when the mod's hooks or engine calls change (434e33b)

- - -


## v0.6.0 - 2026-10-11
#### Features
- skip calls that permission rules deny and log each request to the debug log (d8a7770)
#### Documentation
- name the pre-routing permission check precisely (c4a7bf5)
- write the README and the privacy policy for the user (78fbf6c)
#### Miscellaneous Chores
- start the changelog at v0.5.0 (0e6ac7e)

- - -


## v0.5.0 - 2026-10-11
#### Features
- route through the Agent tool call in one hook (30f076d)
#### Bug Fixes
- log the pick before the call runs and test the fail-open path (5cccc78)
#### Documentation
- say the key stays in memory and qualify the stdin advice (32775d4)
- say when the request leaves and what the hook looks at (78f8464)
- say what the hook looks at and date the policy (07de483)
- describe the one hook and drop the key variable from the README (68324a0)

- - -
