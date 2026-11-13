# How the plugins use the providers

This page holds what the four plugins do the same way when they ask Jev to score a task.
Each plugin's privacy policy and README keep what is specific to the plugin, and link here for the rest.
The word task stands for one routed unit of work.
It is an Agent tool call in Claude Code, a batch item in Oh My Pi, a `sessions_spawn` call in OpenClaw and a `delegate_task` task in Hermes Agent.
The word harness stands for Claude Code, Oh My Pi, OpenClaw or Hermes Agent.

## Which provider gets a task

The `provider` setting picks the providers and their order.
An unknown value acts as `typesafe`.
With `auto` or `openrouter-first` and one key set, the plugin uses that key's provider alone.
With both keys set, one task may reach both companies.
The second provider gets the task only when the first fails.
The failures that count are a `network error`, a timeout of the request (it prints `timeout`), and HTTP status 401, 402, 403, 404, 408, 429 or 5xx.
It never gets the task after 400, 422, `cancelled`, the routing limit (which also prints `timeout`), a bad reply, a `rejected request` or `failed`.

## Keys

Get a key from [TypeSafe](https://console.typesafe.ai/keys) or from [OpenRouter](https://openrouter.ai).
A plugin reads a key only for a provider its `provider` setting allows.
Each key goes only to its own provider's address.
The plugin passes the address and the key with every request, so no environment variable moves a key to another host.
An environment variable can supply a key, and with it the account that receives the task text.
Each key identifies your account to its provider.
With no key for any allowed provider, every task reports `key unset`.
A key with no model still scores: [A slot with no model](#a-slot-with-no-model) says what the plugin does then.

## The config tool

The config tool reports `<provider> key: set` or `<provider> key: unset` for each provider the `provider` value allows.
It never returns a key, its length or any part of it.
In Oh My Pi, OpenClaw and Hermes Agent the tool can also print each model setting, as its README says: the configured value, or `unset`.
It runs no check on a model, so a model the harness cannot run shows only in the routing line.

## A slot with no model

This section holds for Oh My Pi, OpenClaw and Hermes Agent.
Each of them takes the model for a level from a slot: level 0 from `small`, level 1 from `middle` and level 2 from `large`.
Each README names the harness setting of each slot.

A slot is set when it names a model the harness can run.
It is unset when it names no model, and unresolved when it names a model the harness cannot run.
For an unset or unresolved slot, the task keeps the model the harness gives it.
For a task it scores, the plugin still sets the effort, except where the README's list of kept efforts says otherwise.
The routing line names the slot and its state in place of a model, as in `L1 middle model unset` or `L2 large model unresolved`.

An unset slot is your choice and needs no fix: its level runs on the harness's model.
An unresolved slot names a model the harness cannot run, so fix that model or clear the slot.
Each README says what makes a model unresolved in its harness.

No gate checks the models, and no task skips because a slot has no model.
So with a key set and no model set, the plugin still sends each routed task to the provider for scoring and sets the effort.
In OpenClaw and Hermes Agent, a check of the picked slot that does not finish within the routing limit skips the task with `timeout`.
Oh My Pi's role check returns at once, so it has no such skip.

## The request

Each plugin bundles the official TypeSafe SDK, `@typesafe-ai/sdk`, which builds the request for both providers.
The request is an HTTPS POST.
Its JSON body names the Jev alias `jev-latest` and the scoring questions, with three descriptions each.
These texts ship with the plugin.
The question `tier` asks how much judgment the task needs.
The question `work` asks how much work the task takes.
Each plugin's README lists the questions it asks.

The request headers hold:

- `authorization`, with the key of the provider that receives the request
- `accept` and `content-type`, both `application/json`
- `user-agent` and `x-typesafe-sdk`, both naming the SDK and its version, `typesafe-sdk/<version>`
- `x-typesafe-runtime`, which names the runtime, the operating system and the architecture, in the form `<runtime>/<version> (<os>; <arch>)`
- `x-typesafe-retry-count`, `1` or `2`, on a retry only.

OpenRouter receives the same headers, the `x-typesafe-*` ones included.
The SDK writes `unknown` for `x-typesafe-runtime` when it cannot name the runtime.

## No telemetry

The body and the headers above are the whole request, apart from the transport headers that the HTTP client adds, such as `host` and `content-length`.
The plugin sends no telemetry and no other data about you or your machine.

## The task text

Before the task text leaves, the plugin condenses it and masks token-shaped strings.
Condensing replaces each code block fenced with three or more backticks or tildes by a note of its line count.
A block closes at a line that holds, after at most three spaces, a run of the same character at least as long as the opening run, and nothing after it but spaces or tabs.
A block with no such line stays as it is.
Masking replaces these shapes with `***`:

- a private key block in PEM form, from its `BEGIN` line to its `END` line, or, with no `END` line, the header and the base64 lines after it;
- the user and password in a URL, of any length, as in `postgres://user:pass@host`, which keeps its scheme and host; the password may hold `@`, but a password with `/`, `?` or `#` is not masked;
- the credentials of an `Authorization` header: after a scheme such as `Basic`, `Bearer`, `Digest` or `Token`, up to the unescaped quote that encloses them, else to the end of the line; with no scheme, a single value of 16 or more characters;
- a 40-character AWS secret within 100 characters after an access key id, on the same line;
- a JSON Web Token;
- GitHub, GitLab, Slack, Stripe, npm, Hugging Face and PyPI tokens, Slack webhook URLs, Google API keys and AWS access key ids, by their prefixes, each with the whole run of its characters;
- a `Bearer` token, in any case;
- an `sk-` key, such as an OpenAI, Anthropic or OpenRouter key;
- the `user:password` after `-u`, also attached as in `-uuser:pass` or after a group of short flags that ends in `u` as in `-fsSu`, and after `--user` or `--proxy-user`;
- the word after `password`, `passphrase` or `passwd` followed by `is` or `was`, with or without a colon;
- the value assigned with `=` or `:` to a name that ends in `key`, `token`, `secret` or `password`, in any case.

A quoted value after `password is` or after such a name is masked up to its closing quote on the same line, or to the end of that line.
The last rule also masks the word after such a name in prose, as in `primary key: id`.
The `-u` and `password` rules also mask `-u 1000:1000` and `password was reset`.
The agent's description and the call's one-line description pass through the same masking.
A text over 12,000 characters keeps its start and its end.

## Retries and the second provider

With one provider, a routed task sends one request and up to two retries, three attempts in all.
The SDK retries a connection error, a timeout and an HTTP status 408, 429 or 5xx.
It retries no other status.
The retries send the same body as the first request.
The SDK times an attempt out after 10 s, but the routing limit is shorter, so the limit ends a call first.
The only timeout a plugin meets is the 2 s one below, which has no retry.
Before a retry the SDK waits as a `Retry-After` or `retry-after-ms` header says, up to 60 s.
Without one it backs off for 0.5 s, doubling up to 5 s, with some jitter.
The routing limit ends any wait, so a 429 with a long `Retry-After` can hold a task until the limit.

With two providers, the first provider gets one request and no retry.
The plugin gives up on it after 2 s.
The second provider then gets up to three attempts as above, within the rest of the routing limit.
One task therefore sends at most four requests.

## The routing limit and billing

The routing limit is at most 8 s.
It covers the scoring, both providers and all retries included.
Each plugin README says what its limit spans.
The plugin stops waiting at the limit, but it cannot recall a request in flight.
A request can reach its provider even when its answer never returns.
A retry after a network failure may be billed more than once.
A first request the plugin gave up on may still be billed, on top of the second provider's answer.

## What the providers do with it

Each provider processes the request to answer the scoring questions.
TypeSafe's handling of request data is set by its privacy policy at https://typesafe.ai/legal/privacy-policy.
OpenRouter's privacy policy is at https://openrouter.ai/privacy.
OpenRouter does not document retention or training for the System One endpoint.
OpenRouter names the answering model `typesafe/jev-…`, and the plugin cannot see where OpenRouter passes the request on.
The plugin author has no access to those requests.

## Descriptions and private names

An agent's description and a call's one-line description can hold private names, such as a client, a product or a team.
The plugin masks token-shaped strings only, so a private name in a description leaves your machine.

## The option commands

A bare command prints the current value.
A command with a valid value writes it and prints the new value.
An invalid value lists the allowed ones.
A refused or failed write prints `<setting> unchanged: <reason>`.

## Your choices

Set `provider` to `typesafe` or `openrouter` to keep each task with one company.
Remove the key of every provider the `provider` setting allows, and the plugin skips routing.

## Fails open

A plugin fails open.
It never throws into its harness.
A missing key, a closed gate, an error, a timeout or a failed check leaves the task to run as the harness would run it without the plugin.

## The routing line

A routed line holds the chosen level as `L<level>`, then the model or role it sets, or the state of a slot with no model.
It then holds `p=` with the probability of each chosen level, one for each question the plugin asks.
Each plugin's README gives the exact shape.
When the reply carries them, the line also names the Jev model and the token counts.

After a fallback, a routed line ends with the provider that answered and why the first one failed, for example ` · via openrouter (typesafe HTTP 503)`.
After both providers fail, a skip reason names each provider with its own reason, in the order they were tried, for example `skipped, typesafe HTTP 503, openrouter timeout`.
