---
contract_version: 3
---

# Constitution of Akurganow/model-router

## Read first

- README.md
- CONTRIBUTING.md
- plugins/model-router/README.md
- plugins/model-router/docs/model-choice.md
- plugins/model-router-omp/README.md
- plugins/model-router-openclaw/README.md
- plugins/model-router-hermes/README.md
- docs/design.md

## Departments

- dependencies: judged by .github/workflows/dependency-review.yml
- privacy: judged by plugins/model-router/PRIVACY.md
- privacy: judged by plugins/model-router-omp/PRIVACY.md
- privacy: judged by plugins/model-router-openclaw/PRIVACY.md
- privacy: judged by plugins/model-router-hermes/PRIVACY.md

## Fence

- CI validates the plugin, runs its tests, and checks the mod's surface: .github/workflows/ci.yml
- A pull request with an open advisory or an invalid registry signature fails: .github/workflows/ci.yml
- Anthropic's plugin policy scan runs on every pull request and push: .github/workflows/policy.yml
- CI rebuilds every generated file on Ubuntu and macOS and fails on any difference: .github/workflows/ci.yml
- CI installs the Claude Code and omp plugins from the checkout and validates the plugin and the Claude Code catalogue: .github/workflows/ci.yml
- The `package` job packs the npm tree, checks the packed files against its `files` list, runs a publish dry run, and installs the tarball into OpenClaw and omp: .github/workflows/ci.yml
- The `publish` job publishes `@akurganow/model-router` after a release, with npm trusted publishing and only when the registry lacks the version: .github/workflows/release.yml
- The `hermes` job runs the Hermes plugin's tests on Python 3.11 and 3.14 and under the pinned Hermes, validates the plugin and installs it from the checkout: .github/workflows/ci.yml
- CI scans each change's added lines and every generated file for owner-setup facts: .github/workflows/ci.yml

## Regression proof

- npm ci
- npm run check
- claude plugin test plugins/model-router

## Not judged

- package-lock.json
- .claude-plugin/marketplace.json
- .omp-plugin/marketplace.json
- plugins/model-router/.claude-plugin/plugin.json
- plugins/model-router-omp/package.json
- plugins/model-router/hooks/register.js
- plugins/model-router-omp/extension/index.js
- plugins/model-router-openclaw/openclaw.plugin.json
- plugins/model-router-openclaw/index.js
- plugins/model-router-hermes/plugin.yaml
- plugins/model-router-hermes/constants.json
- plugins/model-router-hermes/route.mjs
- packages/model-router, the generated npm tree
- the README install region, between `<!-- install:start -->` and `<!-- install:end -->`

## Execution

- Run code only in a copy under the run directory. Never run it in the clone.
- The tree expects Node 24, named in .github/workflows/ci.yml.

## Executor loads

none

## Labels

- `needs-human` (owner attention): Lawman cannot decide this issue alone. A person decides on it.
- `dependencies`: Pull requests that update a dependency file
- `javascript`: Pull requests that update javascript code
- `bug`: Something isn't working
- `documentation`: Improvements or additions to documentation
- `duplicate`: This issue or pull request already exists
- `enhancement`: New feature or request
- `good first issue`: Good for newcomers
- `help wanted`: Extra attention is needed
- `invalid`: This doesn't seem right
- `question`: Further information is requested
- `wontfix`: This will not be worked on
- `accessibility`: Barrier affecting people with disabilities

## Precedents

none

## Licenses

reaches copies
use non-commercial
sources none
