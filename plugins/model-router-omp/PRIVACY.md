# Privacy policy

model-router for Oh My Pi is a plugin published by Akurganow. This policy says
what the plugin sends, where it goes, and what the plugin keeps. Effective
2026-10-21.

## What the plugin sends

For every `task` batch item it routes, the plugin sends one HTTPS POST to
TypeSafe at https://api.typesafe.ai/v1/systemone. The plugin bundles the
official TypeSafe SDK, `@typesafe-ai/sdk`, which builds the request. The JSON
body holds:

- the item's task text, condensed and with token-shaped strings masked
- a capped part of the batch `context`, at most 3000 characters, prepared the
  same way and placed after the task text. Task text and context together stay
  within 12,000 characters
- the role, always `general-purpose`
- the item's `name` as the description, or an empty description when it has
  none
- the Jev alias `jev-latest`, and one fixed scoring question, `tier`, with
  its three descriptions, text that ships with the plugin.

The request headers hold:

- `authorization`, with your TypeSafe API key as the bearer token
- `accept` and `content-type`, both `application/json`
- `user-agent` and `x-typesafe-sdk`, both naming the SDK and its version,
  `typesafe-sdk/0.7.0`
- `x-typesafe-runtime`, which names the runtime, the operating system and the
  architecture, in the form `bun/<version> (<os>; <arch>)`
- `x-typesafe-retry-count`, `1` or `2`, on a retry only.

The runtime header tells TypeSafe which runtime, system and architecture omp
runs on. The task text and the context hold whatever the caller put in them,
which can include code. The request is sent before omp asks for approval of
the `task` call. A call you later refuse was already sent. That list is the
whole request. The key identifies your TypeSafe account to TypeSafe. The
plugin sends no telemetry and no other data about you or your machine.

The key goes only to https://api.typesafe.ai/v1/systemone. No environment
variable moves it to another host.

## Requests and billing

The plugin sends one request per routed item. A batch of five items sends
five requests. The SDK retries a connection error and an HTTP status 408, 429
or 5xx, up to three attempts in all. It waits for a `Retry-After` header when
one comes, within the limit. A routed item therefore costs up to three
requests. The retries send the same body as the first request.

One fixed 8 s limit covers the scoring of a whole batch, retries included. The
plugin stops waiting at the limit, but it cannot recall a request in flight.
TypeSafe may bill a retried network failure more than once. The plugin sends
no other request.

## What TypeSafe does with it

TypeSafe processes the request to answer the scoring question. Its handling of
request data is set by TypeSafe's own privacy policy at
https://typesafe.ai/legal/privacy-policy. The plugin author has no access to
those requests.

## What the plugin stores

The plugin stores nothing on disk and keeps no routing state between calls.
It holds the key in memory only while it sends a request. It reads the key from
omp's own TypeSafe credential, and when that is empty, from the environment
variable `TYPESAFE_API_KEY`. It sends the key only to the endpoint above, as
the bearer token. It reads no other environment variable and no file, and it
runs no program. Once per batch it reads omp's settings `modelRoles`,
`task.agentModelOverrides` and `task.disabledAgents`, and the source of each
agent omp discovers, to see whether your own `task` agent replaced the bundled
one. It also checks whether the `@smol` and `@slow` roles resolve to a model.
Nothing from these leaves your machine.

The lines the plugin prints per batch go to your omp notifications, or to
standard error when omp has no UI. The setup skill writes only the
configuration you approve: the `smol` and `slow` model roles.

## Your choices

Remove the key from omp's credential store and from `TYPESAFE_API_KEY`, and
the plugin skips routing. Disable the plugin and nothing is sent.

## Children

The plugin is a developer tool and is not intended for people under 18.

## Changes and contact

Changes to this policy appear in this repository's history. Questions go to
https://github.com/Akurganow/model-router/issues.
