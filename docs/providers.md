# How the plugins use the providers

This page holds what the four plugins do the same way when they ask Jev to score a task.
Each plugin's privacy policy and README keep what is specific to the plugin, and link here for the rest.
The word task stands for one routed unit of work.
It is an Agent tool call in Claude Code, a batch item in Oh My Pi, a `sessions_spawn` call in OpenClaw and a `delegate_task` task in Hermes Agent.
The word harness stands for Claude Code, Oh My Pi, OpenClaw or Hermes Agent.
The word provider stands for the company whose model scores a task.
The word gateway stands for OpenRouter, which passes a request on to the provider and is never a provider itself.
A path is one way to the provider: the direct path is the provider's own API, and the gateway path goes through OpenRouter.

## The provider and the gateway

Two settings decide who receives a task.

The `provider` setting says whose model scores.
It has one value, `typesafe`, the default: Jev from TypeSafe, the model the plugin's questions are fitted to.

The `gateway` setting says how OpenRouter is used to reach the provider:

| `gateway` | First path | Second path, after a failure |
| :-- | :-- | :-- |
| `direct`, the default | the provider's own API | none |
| `auto` | the provider's own API | OpenRouter |
| `openrouter-first` | OpenRouter | the provider's own API |
| `openrouter` | OpenRouter | none |

The direct path takes the provider's key, and the gateway path takes the OpenRouter key.
A path whose key is not set is left out.
So with `auto` or `openrouter-first` and one key set, the plugin uses that key's path alone.
With both keys set, one task may reach both companies.
The second path gets the task only when the first fails.
The failures that count are a `network error`, a timeout of the request (it prints `timeout`), and HTTP status 401, 402, 403, 404, 408, 429 or 5xx.
It never gets the task after 400, 422, `cancelled`, the routing limit (which also prints `timeout`), a bad reply or `failed`.
An error status counts as that status even when its body cannot be read.
A 2xx reply whose body cannot be read is a `network error`.

## A setting that is not valid

Each of `provider`, `gateway` and `scope` takes only the values of its own list.
A stored setting that holds any other text is not valid.
An absent or blank value reads as the default.

While a setting is not valid, the plugin routes no task.
Each task runs as it would without the plugin.
The plugin then reads no key and sends no request.
The skip line gives the reason `<setting> not valid: run setup`, for example `provider not valid: run setup`.
Where more than one setting is not valid, the reason names the first of `provider`, `gateway` and `scope`.

The plugin never rewrites a stored value on its own.
To set a valid value, run the `model-router-setup` skill of your plugin, or give the setting's command a value.

### Retired values of `provider`

Earlier versions took `auto`, `openrouter-first` and `openrouter` as values of `provider`.
They are values of `gateway` now, so a stored `provider` that holds one of them is not valid.
For each, one pair of settings gives the same requests as before:

| Stored `provider` | Set `provider` to | Set `gateway` to |
| :-- | :-- | :-- |
| `auto` | `typesafe` | `auto` |
| `openrouter-first` | `typesafe` | `openrouter-first` |
| `openrouter` | `typesafe` | `openrouter` |

The setup skill proposes the pair, and nothing is set before you agree.
Set `gateway` first and `provider` second.
While `provider` is not valid nothing is routed, so in that order no task takes a path you did not choose.
A stored `typesafe` needs no change: with no `gateway` stored it asks TypeSafe's own API only, as before.
Claude Code never shows the setup line for a retired value.
[A stored value outside an option's list](../plugins/model-router/README.md#a-stored-value-outside-an-options-list) says what it does in its place.

## Keys

Get a key from [TypeSafe](https://console.typesafe.ai/keys) or from [OpenRouter](https://openrouter.ai).
The TypeSafe key serves the direct path, and the OpenRouter key serves the gateway path.
In every harness the variable of the TypeSafe key is `TYPESAFE_API_KEY`, and the variable of the OpenRouter key is `OPENROUTER_API_KEY`.
Each plugin README names where else a key can sit.
A plugin reads a key only for a path its `gateway` setting allows.
Each key goes only to the address of the company that issued it.
The plugin passes the address and the key with every request, so no environment variable moves a key to another host.
An environment variable can supply a key, and with it the account that receives the task text.
Each key identifies your account to the company that issued it.
With no key for any allowed path, every task reports `key unset`.
A key with no model still scores: [A slot with no model](#a-slot-with-no-model) says what the plugin does then.

## The config tool

The config tool prints one line for each setting, then one line for each key:

- The provider line reads `provider: typesafe`.
- The gateway line holds the value and, in order, who the plugin asks, as in `gateway: auto (typesafe, then openrouter)`.
  The name is `typesafe` on the direct path and `openrouter` on the gateway path.
- The scope line reads `scope: core`, in a harness that has the setting.
- A key line reads `typesafe key: set` or `openrouter key: unset`.
  The tool prints one for each path the `gateway` value allows, in the same order.

With the defaults and a TypeSafe key set, the tool prints:

```text
provider: typesafe
gateway: direct (typesafe)
scope: core
typesafe key: set
```

The tool never returns a key, its length or any part of it.
In OpenClaw and Hermes Agent the tool also prints each model setting, as its README says: the configured value, or `unset`.

[A setting that is not valid](#a-setting-that-is-not-valid) prints its stored text and the values to use, as `<setting>: <stored text> (not valid: use one of <values>)`.
Every valid setting then prints as `<setting>: <value>`.
The gateway line names nobody, and the tool prints no key line:

```text
provider: typesafe
gateway: fast (not valid: use one of direct, auto, openrouter-first, openrouter)
scope: core
```

## A slot with no model

This section holds for Oh My Pi, OpenClaw and Hermes Agent.
Each of them takes the model for a level from a slot: level 0 from `small`, level 1 from `middle` and level 2 from `large`.
Each README names the harness setting of each slot.

In OpenClaw and Hermes Agent a slot is set when its setting names a model, and unset when it names none.
In Oh My Pi a slot is set when omp has a model for the slot's role, and unset when it has none.
For an unset slot, the task keeps the model the harness gives it.
For a task it scores, the plugin still sets the effort, except where the README's list of kept efforts says otherwise.
The routing line names the slot and its state in place of a model, as in `L1 middle model unset`.

An unset slot is your choice and needs no fix: its level runs on the harness's model.
The plugin sets the model a slot names.

No task skips because a slot has no model.
So with a key set and no model set, the plugin still sends each task it scores to the provider and sets its effort.

## The request

The request is an HTTPS POST.
Its JSON body names the Jev alias `jev-latest` and the scoring questions, with three descriptions each.
These texts ship with the plugin.
The question `tier` asks how much judgment the task needs.
The question `work` asks how much work the task takes.
Each plugin's README lists the questions it asks.

The plugin sets exactly four request headers:

- `Authorization: Bearer <key>`, with the TypeSafe key on the direct path and the OpenRouter key on the gateway path
- `Accept: application/json`
- `Content-Type: application/json`
- `User-Agent: model-router/<version> (+https://github.com/Akurganow/model-router)`, where `<version>` is the plugin version.

OpenRouter receives the same headers.
No header names the runtime, the operating system or the architecture.

A task whose text quotes an image reference, `<image:` and 32 lowercase hexadecimal digits and `>`, goes out as text like any other text.
TypeSafe and OpenRouter both accept such a request.

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
- the value assigned with `=` or `:` to a name that ends in `key`, `token`, `secret`, `password` or `passphrase`, in any case, or to `pass`, `passwd` or `pwd` alone or after `_`, as in `DB_PASS`;
- the value after a flag whose name ends in `key`, `token`, `secret`, `password`, `passphrase`, `passwd`, `pass` or `pwd`, split from it by spaces or tabs, as in `--password s3cret` or `-storepass s3cret`;
- the value after `-p`, split from it by spaces or tabs, as in `docker login -u bob -p s3cret`.

A quoted value after `password is`, such a name, such a flag or `-p` is masked up to its closing quote on the same line, or to the end of that line.
The name rule also masks the word after such a name, as in `primary key: id`, `first pass: read` and `-v $PWD:/app`.
The flag rule also masks `--sort-key name` and `--bypass on`.
The `-p` rule also masks `mkdir -p dir` and `ssh -p 22`.
The `-u` and `password` rules also mask `-u 1000:1000` and `password was reset`.
Where one such name or flag follows another, as in `--askpass --password s3cret`, the mask goes to the last value.
The agent's description and the call's one-line description pass through the same masking.
A text over 12,000 characters keeps its start and its end.

## Retries and the second attempt

One task makes at most two attempts, one for each path its `gateway` value allows.

With one attempt, a routed task sends one request and up to two retries, three requests in all.
The plugin retries a connection error, a timeout and an HTTP status 408, 429 or 5xx.
It retries no other status.
The retries send the same body as the first request.
The plugin times a request out after 10 s, but the routing limit is shorter, so the limit ends a call first.
The only timeout a plugin meets is the 2 s one below, which has no retry.
Before a retry the plugin waits as a `Retry-After` or `retry-after-ms` header says, up to 60 s.
Without one it backs off for 0.5 s, doubling up to 5 s, with some jitter.
The routing limit ends any wait, so a 429 with a long `Retry-After` can hold a task until the limit.

With two attempts, the first gets one request and no retry.
The plugin gives up on it after 2 s.
The second then gets up to three requests as above, within the rest of the routing limit.
One task therefore sends at most four requests.

## The routing limit and billing

The routing limit is at most 8 s.
It covers the scoring, both attempts and all retries included.
Each plugin README says what its limit spans.
The plugin stops waiting at the limit, but it cannot recall a request in flight.
A request can reach its host even when its answer never returns.
A retry after a network failure may be billed more than once.
A first request the plugin gave up on may still be billed, on top of the second attempt's answer.

## What each company does with the text

On the direct path the text goes to TypeSafe.
On the gateway path it goes to OpenRouter, which answers with the provider's model.
Each company processes the request to answer the scoring questions.
TypeSafe's handling of request data is set by its privacy policy at https://typesafe.ai/legal/privacy-policy.
OpenRouter's privacy policy is at https://openrouter.ai/privacy.
OpenRouter does not document retention or training for the System One endpoint.
OpenRouter names the answering model `typesafe/jev-…`, and the plugin cannot see where OpenRouter passes the request on.
The plugin author has no access to those requests.

## Descriptions and private names

An agent's description and a call's one-line description can hold private names, such as a client, a product or a team.
The plugin masks token-shaped strings only, so a private name in a description leaves your machine.

## The option commands

Each setting has a command, and each plugin README names it.
A bare command prints the setting's line, as [the config tool](#the-config-tool) prints it.
A command with a valid value writes it and prints the new line.
A valid value replaces a stored value that is not valid.
An invalid value lists the allowed ones.
A refused or failed write prints `<setting> unchanged: <reason>` and leaves the stored value as it was.

## Your choices

Set `gateway` to `direct` or `openrouter` to send each task on one path only.
Under `direct`, the default, no task reaches OpenRouter.
Remove the key of every path the `gateway` setting allows, and the plugin skips routing.

## Fails open

A plugin fails open.
It never throws into its harness.
A missing key, a setting that is not valid, a closed gate, an error or a timeout leaves the task to run as the harness would run it without the plugin.

## The routing line

A routed line holds the chosen level as `L<level>`, then the model or role it sets, or the state of a slot with no model.
It then holds `p=` with the probability of each chosen level, one for each question the plugin asks.
Each plugin's README gives the exact shape.

The line then names who answered: `typesafe` on the direct path, `openrouter` on the gateway path.
The model the reply names follows, and then the token counts, as in ` · typesafe jev-1.14.0 · 812/9 tok`.
A reply with no model name or no token counts leaves that part out, and the name stays.

After a fallback, a routed line ends with the attempt that failed and its reason, for example ` · openrouter typesafe/jev-1.14.0 · 812/9 tok · typesafe HTTP 503`.
After both attempts fail, a skip reason names each with its own reason, in the order they were tried, for example `skipped, typesafe HTTP 503, openrouter timeout`.
