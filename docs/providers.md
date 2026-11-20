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
It never gets the task after 400, 422, `cancelled`, the routing limit (which also prints `timeout`), a bad reply or `failed`.
An error status counts as that status even when its body cannot be read.
A 2xx reply whose body cannot be read is a `network error`.

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
In OpenClaw and Hermes Agent the tool also prints each model setting, as its README says: the configured value, or `unset`.

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

- `Authorization: Bearer <key>`, with the key of the provider that receives the request
- `Accept: application/json`
- `Content-Type: application/json`
- `User-Agent: model-router/<version> (+https://github.com/Akurganow/model-router)`, where `<version>` is the plugin version.

OpenRouter receives the same headers.
No header names the runtime, the operating system or the architecture.

A task whose text quotes an image reference, `<image:` and 32 lowercase hexadecimal digits and `>`, goes out as text like any other text.
Both providers accept such a request.

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

## Retries and the second provider

With one provider, a routed task sends one request and up to two retries, three requests in all.
The plugin retries a connection error, a timeout and an HTTP status 408, 429 or 5xx.
It retries no other status.
The retries send the same body as the first request.
The plugin times a request out after 10 s, but the routing limit is shorter, so the limit ends a call first.
The only timeout a plugin meets is the 2 s one below, which has no retry.
Before a retry the plugin waits as a `Retry-After` or `retry-after-ms` header says, up to 60 s.
Without one it backs off for 0.5 s, doubling up to 5 s, with some jitter.
The routing limit ends any wait, so a 429 with a long `Retry-After` can hold a task until the limit.

With two providers, the first provider gets one request and no retry.
The plugin gives up on it after 2 s.
The second provider then gets up to three requests as above, within the rest of the routing limit.
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
A missing key, a closed gate, an error or a timeout leaves the task to run as the harness would run it without the plugin.

## The routing line

A routed line holds the chosen level as `L<level>`, then the model or role it sets, or the state of a slot with no model.
It then holds `p=` with the probability of each chosen level, one for each question the plugin asks.
Each plugin's README gives the exact shape.

The line then names the provider that answered, as the `provider` setting names it: `typesafe` or `openrouter`.
The model its reply names follows the provider, and then the token counts, as in ` · typesafe jev-1.14.0 · 812/9 tok`.
A reply with no model name or no token counts leaves that part out, and the provider stays.

After a fallback, a routed line ends with the provider that failed and its reason, for example ` · openrouter jev-1.14.0 · 812/9 tok · typesafe HTTP 503`.
After both providers fail, a skip reason names each provider with its own reason, in the order they were tried, for example `skipped, typesafe HTTP 503, openrouter timeout`.
