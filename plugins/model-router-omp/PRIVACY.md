# Privacy policy

model-router for Oh My Pi is a plugin published by Akurganow. This policy says
what the plugin sends, where it goes, and what the plugin keeps. Effective
2026-10-21.

## What the plugin sends

For every `task` batch item it routes, the plugin sends one HTTPS POST to
TypeSafe at https://api.typesafe.ai/v1/systemone. The request holds:

- the item's task text, condensed and with token-shaped strings masked
- a capped part of the batch `context`, at most 3000 characters, prepared the
  same way and placed after the task text
- the role, always `general-purpose`
- the item's `name` as the description, or an empty description when it has
  none
- the Jev alias you chose, `jev-latest` or `jev-preview`, and two fixed
  scoring questions with their three descriptions each, text that ships with
  the plugin
- your TypeSafe API key, as the bearer token.

The task text and the context hold whatever the caller put in them, which can
include code. The request is sent before omp asks for approval of the `task`
call. A call you later refuse was already sent. That list is the whole
request. The key identifies your TypeSafe account to TypeSafe. The plugin
sends no telemetry and no other identifier of you or your machine.

## Requests and billing

The plugin sends one request per routed item. A batch of five items sends
five requests. A network error, or HTTP status 408, 429 or 5xx, gets one
retry after 300 ms. A routed item therefore costs up to two requests. TypeSafe
may bill a retried network failure twice. The plugin sends no other request.

## What TypeSafe does with it

TypeSafe processes the request to answer two scoring questions. Its handling of
request data is set by TypeSafe's own privacy policy at
https://typesafe.ai/legal/privacy-policy. The plugin author has no access to
those requests.

## What the plugin stores

The plugin stores nothing on disk and keeps no routing state between calls.
It holds the key in memory only while it sends a request. It reads the key from
omp's own TypeSafe credential, and when that is empty, from the environment
variable `TYPESAFE_API_KEY`. It sends the key only to the endpoint above, as
the bearer token. From the environment it reads only `MODEL_ROUTER_JEV`, for
the Jev alias, and `PI_CODING_AGENT_DIR`, the omp agent folder that omp sets
for a profile. Without that variable it uses `.omp/agent` in your home folder.
It checks whether a `task.md` file exists in the `agents` folder there and in
the nearest project agent folder, and it reads no file content.

Once per batch, the plugin runs the omp program it runs in, twice:
`omp config get task.enableEffort --json` and
`omp config get task.maxEffort --json`. It uses the two answers to decide
whether to set effort and to show the level omp applies. Nothing from them
leaves your machine.

The lines the plugin prints per batch go to your omp notifications, or to
standard error when omp has no UI. The setup skill writes only the
configuration you approve: the router model roles, the effort settings and
`MODEL_ROUTER_JEV` in omp's agent `.env` file.

## Your choices

Remove the key from omp's credential store and from `TYPESAFE_API_KEY`, and
the plugin skips routing. Disable the plugin and nothing is sent.

## Children

The plugin is a developer tool and is not intended for people under 18.

## Changes and contact

Changes to this policy appear in this repository's history. Questions go to
https://github.com/Akurganow/model-router/issues.
