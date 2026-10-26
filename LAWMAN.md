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

## Departments

- dependencies: judged by .github/workflows/dependency-review.yml
- privacy: judged by plugins/model-router/PRIVACY.md
- privacy: judged by plugins/model-router-omp/PRIVACY.md

## Fence

- CI validates the plugin, runs its tests, and checks the mod's surface: .github/workflows/ci.yml
- A pull request with an open advisory or an invalid registry signature fails: .github/workflows/ci.yml
- Anthropic's plugin policy scan runs on every pull request and push: .github/workflows/policy.yml

## Regression proof

- npm ci
- npm run check
- claude plugin test plugins/model-router

## Not judged

- package-lock.json
- .claude-plugin/marketplace.json
- .omp-plugin/marketplace.json

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
