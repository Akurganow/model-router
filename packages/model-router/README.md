# @akurganow/model-router

Routes OpenClaw and Oh My Pi subagents to a small, middle or large model and an effort that fit the task.

model-router sends a lookup to a small model, bounded work to a middle model and open-ended work to a large one. Where no model is set for one of the three, the harness keeps its own. A decision model scores each task the plugin routes: [Jev](https://docs.typesafe.ai) from TypeSafe by default, or OpenAI's or Google's, on the provider's own API or through OpenRouter.

## Install

OpenClaw:

```sh
openclaw plugins install npm:@akurganow/model-router --force --accept-capabilities
openclaw plugins enable model-router-openclaw
openclaw plugins inspect model-router-openclaw --runtime --json
```

Review the source of the package before you run these commands: they carry `--force` and `--accept-capabilities`.

Oh My Pi:

```sh
omp plugin install @akurganow/model-router
```

Then follow the setup steps: [OpenClaw guide](https://github.com/Akurganow/model-router/blob/main/plugins/model-router-openclaw/README.md), [Oh My Pi guide](https://github.com/Akurganow/model-router/blob/main/plugins/model-router-omp/README.md).

## What leaves the machine

Each task the plugin scores sends its condensed text and short texts that describe it and its agent, with token-shaped strings masked. They go to the provider's own API, to OpenRouter or to both, as the `provider` and `gateway` settings allow. The privacy policies list the request: [OpenClaw privacy policy](https://github.com/Akurganow/model-router/blob/main/plugins/model-router-openclaw/PRIVACY.md), [Oh My Pi privacy policy](https://github.com/Akurganow/model-router/blob/main/plugins/model-router-omp/PRIVACY.md).

## More

The source, and the plugins for Claude Code and Hermes Agent, are at https://github.com/Akurganow/model-router. The licence is MIT.
