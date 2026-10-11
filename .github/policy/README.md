# Policy scan

`prompt.md` and `schema.json` are copied unchanged from
anthropics/claude-plugins-official, `.github/policy/`, at commit f359d43
(Apache-2.0). The `policy` workflow runs them over this plugin with
Anthropic's `scan-plugins` action on every pull request and push to main.
A finding fails the check.
