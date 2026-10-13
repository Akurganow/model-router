# Policy scan

`prompt.md` and `schema.json` are copied unchanged from
anthropics/claude-plugins-official, `.github/policy/`, at commit f359d43
(Apache-2.0). The `policy` workflow runs them over this plugin with
Anthropic's `scan-plugins` action on every pull request and push to main.
A finding fails the check.

The verdict is cached under the hash of this folder and the commit's tree
hash, so one tree is scanned once and a re-run of the same content reuses
its verdict. A change to the prompt or the schema scans everything again.
