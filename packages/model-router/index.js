// src/core/output/reasons.ts
var CALLER_EFFORT = "caller effort";
var CONFIG_EFFORT = "config effort";
var SUBAGENT_MODEL_SET = "subagent model set";
var UNREADABLE = "settings unreadable";
var KEY_UNSET = "key unset";
var BAD_REPLY = "bad reply";
var TIMEOUT = "timeout";
var FAILED = "failed";
var NETWORK_ERROR = "network error";
var httpStatus = (status) => `HTTP ${status}`;
var CANCELLED = "cancelled";
var outsideCoreScope = (id) => `${id} is outside the core scope`;
var agentDiscoveryFailed = (id) => `${id} agent discovery failed`;
var agentUnknown = (id) => `${id} agent unknown`;
var setsOwnModel = (id) => `${id} sets its own model`;
var notValid = (setting) => `${setting} not valid: run setup`;
var failedAttemptText = (f) => `${f.holder} ${f.reason}`;

// src/core/output/line.ts
var LINE_PREFIX = "model-router ";
var pinnedLine = (level, target) => `L${level} ${target}`;
function routedLine({
  level,
  target,
  effort,
  probabilities,
  suffix
}) {
  const effortSegment = effort === void 0 ? "" : ` \xB7 ${effort}`;
  return `${pinnedLine(level, target)}${effortSegment} \xB7 p=${probabilities}${suffix}`;
}
var SKIPPED_PREFIX = "skipped, ";
var skippedLine = (reason) => `${SKIPPED_PREFIX}${reason}`;
var PROBABILITY_DIGITS = 2;
var formatProbability = (p) => p.toFixed(PROBABILITY_DIGITS);
var isCount = (v) => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
function decisionSuffix({
  holder,
  model,
  inputTokens,
  outputTokens,
  failed
}) {
  return ` \xB7 ${holder}` + (model ? ` ${model}` : "") + (isCount(inputTokens) && isCount(outputTokens) ? ` \xB7 ${inputTokens}/${outputTokens} tok` : "") + (failed ? ` \xB7 ${failedAttemptText(failed)}` : "");
}

// src/core/scoring/limit.ts
var ROUTING_LIMIT_MS = 8e3;
var LIMIT_REACHED = /* @__PURE__ */ Symbol("routing limit reached");
function abortCategory(signal) {
  return signal.reason === LIMIT_REACHED ? TIMEOUT : CANCELLED;
}
function limitSignal(ms, clock, parent) {
  const controller = new AbortController();
  const { signal } = controller;
  const disarmed = { signal, disarm: () => void 0 };
  if (ms <= 0) {
    controller.abort(LIMIT_REACHED);
    return disarmed;
  }
  if (parent?.aborted) {
    controller.abort(parent.reason);
    return disarmed;
  }
  const timer = clock.after(ms, () => controller.abort(LIMIT_REACHED));
  const onParentAbort = () => controller.abort(parent?.reason);
  parent?.addEventListener("abort", onParentAbort, { once: true });
  return {
    signal,
    disarm: () => {
      parent?.removeEventListener("abort", onParentAbort);
      timer.cancel();
    }
  };
}
async function raceDeadline(work2, deadlineMs, clock, parent) {
  try {
    const { signal, disarm } = limitSignal(deadlineMs, clock, parent);
    try {
      return await new Promise((settle) => {
        const onAbort = () => settle(void 0);
        signal.addEventListener("abort", onAbort, { once: true });
        if (signal.aborted) onAbort();
        work2(signal).then(settle, () => settle(void 0));
      });
    } finally {
      try {
        disarm();
      } catch {
      }
    }
  } catch {
    return void 0;
  }
}

// src/core/scoring/handler-deadline.ts
var HANDLER_MARGIN_MS = 2e3;
var MIN_DEADLINE_MS = 1e3;
var MIN_TIMEOUT_MS = MIN_DEADLINE_MS + HANDLER_MARGIN_MS;
var deadlineFor = (timeout) => Math.min(ROUTING_LIMIT_MS, timeout - HANDLER_MARGIN_MS);

// src/utils/clock.ts
var realClock = {
  after: (ms, fn) => {
    const timer = setTimeout(fn, ms);
    return { cancel: () => clearTimeout(timer) };
  }
};

// src/utils/text.ts
var nonEmpty = (value) => {
  const text = typeof value === "string" ? value.trim() : "";
  return text === "" ? void 0 : text;
};

// src/utils/guards.ts
var isRecord = (v) => typeof v === "object" && v !== null;
var isSet = (v) => typeof v === "string" ? nonEmpty(v) !== void 0 : v !== void 0 && v !== null;

// src/core/decision/slots.ts
var SLOTS = ["small", "middle", "large"];
var slotForLevel = (level) => SLOTS[level];
var slotSetting = (slot) => `${slot}_model`;
var SLOT_SETTINGS = SLOTS.map(slotSetting);
var slotRecord = (make) => Object.fromEntries(SLOTS.map((slot) => [slot, make(slot)]));
var slotState = (model) => model === void 0 ? { state: "unset" } : { state: "set", model };
function pickModel(level, state) {
  const slot = slotForLevel(level);
  return state.state === "set" ? { slot, model: state.model, target: state.model } : { slot, model: void 0, target: `${slot} model unset` };
}
var slotLine = (name, shown) => `${name}: ${shown ?? "unset"}`;

// src/core/providers/provider.ts
var MAKERS = ["typesafe"];
var KEY_HOLDERS = [...MAKERS, "openrouter"];
var GATEWAYS = [
  "direct",
  "auto",
  "openrouter-first",
  "openrouter"
];
var KEY_VARIABLES = {
  typesafe: "TYPESAFE_API_KEY",
  openrouter: "OPENROUTER_API_KEY"
};
var KEY_FIELDS = {
  typesafe: "api_key",
  openrouter: "openrouter_api_key"
};
var FIRST_ATTEMPT_TIMEOUT_MS = 2e3;
var GATEWAY_PATHS = {
  direct: ["direct"],
  auto: ["direct", "openrouter"],
  "openrouter-first": ["openrouter", "direct"],
  openrouter: ["openrouter"]
};
var holderOf = (maker, path) => path === "direct" ? maker : path;
var steps = (choice) => GATEWAY_PATHS[choice.gateway].map((path) => ({
  maker: choice.provider,
  path,
  holder: holderOf(choice.provider, path)
}));
var holders = (choice) => "skipped" in choice ? [] : steps(choice).map((step) => step.holder);
function collectKeysSync(choice, lookup) {
  const keys = {};
  for (const holder of holders(choice)) {
    const key = lookup(holder);
    if (key !== void 0) keys[holder] = key;
  }
  return keys;
}
function plan(choice, keys) {
  if ("skipped" in choice) return choice;
  const attempts = [];
  for (const step of steps(choice)) {
    const key = keys[step.holder];
    if (key) attempts.push({ ...step, key });
  }
  return attempts.map(
    (attempt, i) => i < attempts.length - 1 ? { ...attempt, timeout: FIRST_ATTEMPT_TIMEOUT_MS, retries: 0 } : attempt
  );
}

// src/utils/error.ts
var errorText = (err) => err instanceof Error ? err.message : String(err);

// src/core/options/scope.ts
var SCOPE_VALUES = ["core", "extended"];

// src/core/options/settings.ts
var VALUE_SETTINGS = ["provider", "gateway", "scope"];
var TOOL_NAME = "model_router_config";
var COMMAND_PREFIX = "model-router-";
var commandName = (setting) => `${COMMAND_PREFIX}${setting}`;
var TEXTS = {
  provider: {
    values: MAKERS,
    about: "whose model scores subagent calls",
    question: "Which provider's model should score subagent calls?",
    consequences: {
      typesafe: "Jev from TypeSafe, the model the plugin's questions are fitted to"
    }
  },
  gateway: {
    values: GATEWAYS,
    about: "how OpenRouter is used for the provider",
    question: "How should OpenRouter be used for the provider?",
    consequences: {
      direct: "the provider's own API only",
      auto: "the provider's own API, then OpenRouter if it fails",
      "openrouter-first": "OpenRouter, then the provider's own API if it fails",
      openrouter: "OpenRouter only"
    }
  },
  scope: {
    values: SCOPE_VALUES,
    about: "which agent calls the router routes",
    question: "Which agent calls should the router route?",
    consequences: {
      core: "built-in general agents only",
      extended: "also routes other agents that pass no model"
    }
  }
};
var isValue = (setting, value) => TEXTS[setting].values.some((known) => known === value);
var isSilent = (stored) => typeof stored !== "string" || stored.trim() === "";
var valueFor = (setting, stored) => isSilent(stored) ? TEXTS[setting].values[0] : TEXTS[setting].values.find((value) => value === stored);
var readProvider = (stored) => MAKERS.find((maker) => maker === valueFor("provider", stored));
var readGateway = (stored) => GATEWAYS.find((gateway) => gateway === valueFor("gateway", stored));
var readScope = (stored) => SCOPE_VALUES.find((scope) => scope === valueFor("scope", stored));
function settingsOf(stored) {
  const provider = readProvider(stored.provider);
  if (provider === void 0) return { skipped: notValid("provider") };
  const gateway = readGateway(stored.gateway);
  if (gateway === void 0) return { skipped: notValid("gateway") };
  const scope = readScope(stored.scope);
  if (scope === void 0) return { skipped: notValid("scope") };
  return { provider, gateway, scope };
}
var useOneOf = (setting) => `${setting}: use one of ${TEXTS[setting].values.join(", ")}`;
var unchanged = (setting, reason) => `${setting} unchanged: ${reason}`;
var unchangedBy = (setting, err) => unchanged(setting, errorText(err));
var alreadyValue = (value) => `already ${value}`;
var keyLine = (holder, state) => `${holder} key: ${state}`;
var valueLine = (setting, stored) => {
  const value = valueFor(setting, stored[setting]);
  if (value === void 0)
    return `${setting}: ${String(stored[setting])} (not valid: use one of ${TEXTS[setting].values.join(", ")})`;
  const settings = settingsOf(stored);
  if (setting === "gateway" && !("skipped" in settings))
    return `gateway: ${value} (${holders(settings).join(", then ")})`;
  return `${setting}: ${value}`;
};
var settingsReport = (stored, extra, keys) => {
  const settings = settingsOf(stored);
  const keyLines = "skipped" in settings ? [] : holders(settings).map(
    (holder) => keyLine(holder, keys[holder] === void 0 ? "unset" : "set")
  );
  return [
    ...VALUE_SETTINGS.map((setting) => valueLine(setting, stored)),
    ...extra,
    ...keyLines
  ].join("\n");
};
var readOnlyToolDescription = (returned) => `Reads the router's settings. It returns ${returned.join(", ")}, and whether each key the settings allow is set. It changes nothing and never returns a key.`;
var TOOL_LABEL = "Model Router settings";
function describeCommand(setting) {
  const { about, values } = TEXTS[setting];
  return `Shows or changes ${about}: ${values.join(", ")}.`;
}
var COMMAND_DESCRIPTIONS = {
  provider: describeCommand("provider"),
  gateway: describeCommand("gateway"),
  scope: describeCommand("scope")
};

// src/adapters/openclaw/settings.ts
var PLUGIN_ID = "model-router-openclaw";
var pluginEntry = (config) => config?.plugins?.entries?.[PLUGIN_ID];
function withPluginSetting(draft, setting, value) {
  const plugins = draft.plugins ?? {};
  const entries = plugins.entries ?? {};
  const entry = entries[PLUGIN_ID] ?? {};
  const config = entry.config ?? {};
  config[setting] = value;
  draft.plugins = {
    ...plugins,
    entries: { ...entries, [PLUGIN_ID]: { ...entry, config } }
  };
}
function sources(live, pluginConfig) {
  return [pluginEntry(live)?.config, pluginConfig].filter(isRecord);
}
var firstText = (from, field) => from.map((settings) => settings[field]).find((text) => !isSilent(text));
function firstValid(from, field, parse) {
  for (const settings of from) {
    const parsed = parse(settings[field]);
    if (parsed !== void 0) return parsed;
  }
  return void 0;
}
function readLive(api) {
  try {
    return api.runtime.config.current();
  } catch {
    return void 0;
  }
}
function readSettings(live, pluginConfig) {
  const from = sources(live, pluginConfig);
  return {
    stored: {
      provider: firstText(from, "provider"),
      gateway: firstText(from, "gateway"),
      scope: firstText(from, "scope")
    },
    models: slotRecord((slot) => firstValid(from, slotSetting(slot), nonEmpty))
  };
}
function readKeys(live, pluginConfig, choice, env) {
  const from = sources(live, pluginConfig);
  return collectKeysSync(
    choice,
    (holder) => firstValid(from, KEY_FIELDS[holder], nonEmpty) ?? nonEmpty(env[KEY_VARIABLES[holder]])
  );
}
function readState(api, env) {
  const config = readLive(api);
  const settings = readSettings(config, api.pluginConfig);
  const chosen = settingsOf(settings.stored);
  return {
    config,
    settings,
    chosen,
    keys: readKeys(config, api.pluginConfig, chosen, env)
  };
}

// src/adapters/openclaw/config.ts
var COMMAND_NAMES = VALUE_SETTINGS.map(commandName);
var ADMIN_SCOPE = "operator.admin";
var LINE_BREAK = "\n";
var NOT_OWNER = "only the owner can change it";
var TOOL_DESCRIPTION = readOnlyToolDescription([
  "the provider",
  "the gateway",
  "the scope",
  "the three models"
]);
function readAll({ settings, keys }) {
  return settingsReport(
    settings.stored,
    SLOTS.map((slot) => slotLine(slotSetting(slot), settings.models[slot])),
    keys
  );
}
var isOwner = (ctx) => ctx.senderIsOwner === true;
async function write(api, ctx, setting, value, stored) {
  try {
    await api.runtime.config.mutateConfigFile({
      afterWrite: { mode: "auto" },
      ...ctx.assertOwnerCurrent ? { writeOptions: { assertCurrent: ctx.assertOwnerCurrent } } : {},
      mutate: (draft) => withPluginSetting(draft, setting, value)
    });
    return valueLine(setting, { ...stored, [setting]: value });
  } catch (err) {
    return unchangedBy(setting, err);
  }
}
async function runCommand(api, env, ctx, setting) {
  const value = (ctx.args ?? "").trim();
  const { stored } = readState(api, env).settings;
  if (value === "") return valueLine(setting, stored);
  if (!isValue(setting, value)) return useOneOf(setting);
  if (!isOwner(ctx))
    return [unchanged(setting, NOT_OWNER), valueLine(setting, stored)].join(
      LINE_BREAK
    );
  if (stored[setting] === value) return unchanged(setting, alreadyValue(value));
  return write(api, ctx, setting, value, stored);
}
var textOf = (text) => ({
  content: [{ type: "text", text }]
});
function failure(err) {
  return `error: ${errorText(err)}`;
}
function registerConfigTool(api, env) {
  api.registerTool({
    name: TOOL_NAME,
    label: TOOL_LABEL,
    description: TOOL_DESCRIPTION,
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false
    },
    execute: async () => {
      try {
        return textOf(readAll(readState(api, env)));
      } catch (err) {
        return textOf(failure(err));
      }
    }
  });
}
function registerConfigCommands(api, env) {
  for (const setting of VALUE_SETTINGS)
    api.registerCommand({
      name: commandName(setting),
      description: COMMAND_DESCRIPTIONS[setting],
      acceptsArgs: true,
      requiredScopes: [ADMIN_SCOPE],
      handler: async (ctx) => {
        try {
          return { text: await runCommand(api, env, ctx, setting) };
        } catch (err) {
          return { text: failure(err) };
        }
      }
    });
}

// src/core/brief/brief.ts
var BUDGET_CHARS = 12e3;
var ROLE_CAP = 500;
var NO_DESCRIPTION = "An agent with no description.";
var DEFAULT_ROLE = "General-purpose agent for researching complex questions, searching for code, and executing multi-step tasks. When you are searching for a keyword or file and are not confident that you will find the right match in the first few tries use this agent to perform the search for you.";
var OMISSION_MARKER = "\n[middle of the brief omitted]\n";
var HEAD_SHARE = 2 / 3;
var CONTEXT_CAP_CHARS = 3e3;
var CONTEXT_MIN_CHARS = 500;
var CONTEXT_LABEL = "\n\nBatch context:\n";
var PEM_LABEL = "[ A-Z0-9_-]{0,100}PRIVATE KEY(?: BLOCK)?-----";
var AWS_ID = "(?:A3T[A-Z0-9]|AKIA|ASIA|ABIA|ACCA)[A-Z0-9]{16}(?![A-Za-z0-9])";
var AUTH_SCHEMES = [
  "AWS4-HMAC-SHA256",
  "ApiKey",
  "Basic",
  "Bearer",
  "Concealed",
  "Digest",
  "DPoP",
  "GNAP",
  "HOBA",
  "Mutual",
  "Negotiate",
  "NTLM",
  "OAuth",
  "PrivateToken",
  "SCRAM-SHA-1",
  "SCRAM-SHA-256",
  "Token",
  "vapid"
].join("|");
var AUTH_HEAD = `\\bAuthorization["']?\\s*[:=]\\s*`;
var AUTH_SCHEME = `(?:${AUTH_SCHEMES})[ \\t]+`;
var quotedRun = (quote) => `[^${quote}\\\\\\n]*(?:\\\\.[^${quote}\\\\\\n]*)*`;
var SECRET_NAME = "(?:[A-Za-z0-9_]*(?:KEY|TOKEN|SECRET|PASS(?:WORD|PHRASE))|(?:[A-Za-z0-9_]*_)?(?:PASS(?:WD)?|PWD))";
var SECRET_FLAG = "--?[A-Za-z0-9_-]*(?:key|token|secret|pass(?:word|phrase|wd)?|pwd)";
var FLAG_START = "(?<![A-Za-z0-9_-])";
var SECRET_VALUE = `(?!${SECRET_NAME}["']?\\s*[=:]|(?:${SECRET_FLAG}|-p)[ \\t])(?:"[^"\\n]*"?|'[^'\\n]*'?|[^\\s"']+)`;
var TOKEN_PREFIXES = {
  "GitHub token": "gh[pousr]_[A-Za-z0-9]{36,}",
  "GitHub fine-grained token": "github_pat_[A-Za-z0-9_]{22,}",
  "GitLab token": "glpat-[A-Za-z0-9_-]{20,}",
  "Slack token": "xox[abeoprs]-[A-Za-z0-9-]{10,}",
  "Slack app token": "xapp-\\d-[A-Za-z0-9-]{10,}",
  "Slack webhook": "hooks\\.slack\\.com/(?:services|workflows|triggers)/[A-Za-z0-9+/]{20,}",
  "AWS access key id": AWS_ID,
  "Google API key": "AIza[A-Za-z0-9_-]{35,}",
  "Stripe key": "[rs]k_(?:live|test|prod)_[A-Za-z0-9]{10,}",
  "npm token": "npm_[A-Za-z0-9]{36,}",
  "Hugging Face token": "hf_[A-Za-z]{34,}",
  "PyPI token": "pypi-AgEIcHlwaS5vcmc[A-Za-z0-9_-]{50,}"
};
var REDACTIONS = [
  {
    name: "PEM private key",
    pattern: new RegExp(
      `-----BEGIN${PEM_LABEL}(?:(?:[^-]|-(?!----))*-----END${PEM_LABEL}|(?:(?:\\s|\\\\[rn])+[A-Za-z0-9+/=]{16,})*)`,
      "gi"
    ),
    replacement: "***"
  },
  {
    name: "URL credentials",
    pattern: /(?<![a-z0-9+.-])([a-z][a-z0-9+.-]{0,30}:\/\/)[^\s:@/?#'"]*:[^\s/?#'"]+@/gi,
    replacement: "$1***@"
  },
  {
    name: "Authorization header",
    pattern: new RegExp(
      `(${AUTH_HEAD}["']?${AUTH_SCHEME})(?:${[
        `(?<="${AUTH_SCHEME})${quotedRun('"')}`,
        `(?<='${AUTH_SCHEME})${quotedRun("'")}`,
        `(?<="${AUTH_HEAD}${AUTH_SCHEME})${quotedRun('"')}`,
        `(?<='${AUTH_HEAD}${AUTH_SCHEME})${quotedRun("'")}`,
        "[^\\n]*"
      ].join("|")})|(${AUTH_HEAD}["']?)[A-Za-z0-9._~+/=-]{16,}`,
      "gi"
    ),
    replacement: "$1$2***"
  },
  {
    name: "AWS secret",
    pattern: new RegExp(
      `((?<![A-Za-z0-9])${AWS_ID}[^\\n]{0,100}?)(?<![A-Za-z0-9+/])[A-Za-z0-9+/]{40}(?![A-Za-z0-9+/=])`,
      "g"
    ),
    replacement: "$1***"
  },
  {
    name: "JSON Web Token",
    pattern: /(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{8,}={0,2}\.ey[A-Za-z0-9_-]{8,}={0,2}\.[A-Za-z0-9_-]*/g,
    replacement: "***"
  },
  {
    name: "token prefixes",
    pattern: new RegExp(
      `(?<![A-Za-z0-9])(?:${Object.values(TOKEN_PREFIXES).join("|")})`,
      "g"
    ),
    replacement: "***"
  },
  {
    name: "Bearer token",
    pattern: /Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
    replacement: "Bearer ***"
  },
  { name: "sk- key", pattern: /\bsk-[A-Za-z0-9_-]{8,}/g, replacement: "***" },
  {
    name: "curl user",
    pattern: /((?<!\S)(?:-[A-Za-z]{0,8}u|--(?:proxy-)?user)(?:\s+|=)?)(?:"[^"\n:]*:[^"\n]*"|'[^'\n:]*:[^'\n]*'|[^\s"':]+:[^\s"']+)/g,
    replacement: "$1***"
  },
  {
    name: "password is",
    pattern: /\b(pass(?:word|phrase)|passwd)(\s+(?:is|was)(?::\s*|\s+))(?:"[^"\n]*"?|'[^'\n]*'?|[^\s"']+)/gi,
    replacement: "$1$2***"
  },
  {
    name: "secret name",
    pattern: new RegExp(
      `\\b(${SECRET_NAME})(["']?\\s*[=:]\\s*)${SECRET_VALUE}`,
      "gi"
    ),
    replacement: "$1$2***"
  },
  {
    name: "secret flag",
    pattern: new RegExp(
      `(${FLAG_START}${SECRET_FLAG}[ \\t]+)${SECRET_VALUE}`,
      "gi"
    ),
    replacement: "$1***"
  },
  {
    name: "password -p",
    pattern: new RegExp(`(${FLAG_START}-p[ \\t]+)${SECRET_VALUE}`, "g"),
    replacement: "$1***"
  }
];
var FENCE_OPENER = /(?<![`~])(?:(`{3,})[^\n`]*|(~{3,})[^\n~]*)\n/g;
var FENCE_CLOSER = /^ {0,3}(`{3,}|~{3,})[ \t]*\r?$/;
function prepareBrief(text, budget = BUDGET_CHARS) {
  const condensed = condense(redact(text));
  if (condensed.length <= budget) return condensed;
  const kept = budget - OMISSION_MARKER.length;
  const head = Math.floor(kept * HEAD_SHARE);
  const tail = kept - head;
  return `${condensed.slice(0, head)}${OMISSION_MARKER}${condensed.slice(condensed.length - tail)}`;
}
function condense(text) {
  return condenseFences(text).replace(/\n{3,}/g, "\n\n");
}
function condenseFences(text) {
  const lines = text.split("\n");
  const starts = [];
  let offset = 0;
  for (const line2 of lines) {
    starts.push(offset);
    offset += line2.length + 1;
  }
  const runs = lines.map((line2) => FENCE_CLOSER.exec(line2)?.[1] ?? "");
  const longest = {
    "`": longestAfter(runs, "`"),
    "~": longestAfter(runs, "~")
  };
  const opener = new RegExp(FENCE_OPENER);
  let out = "";
  let kept = 0;
  let line = 0;
  for (let open = opener.exec(text); open; open = opener.exec(text)) {
    const run = open[1] ?? open[2] ?? "";
    const first = open.index + open[0].length;
    while ((starts[line] ?? Number.POSITIVE_INFINITY) < first) line++;
    const char = run.startsWith("`") ? "`" : "~";
    if ((longest[char][line] ?? 0) < run.length) continue;
    let close = line;
    while (!closes(runs[close] ?? "", run)) close++;
    const count2 = close - line;
    out += `${text.slice(kept, open.index)}[an exact block of ${count2} ${count2 === 1 ? "line" : "lines"} is given verbatim]`;
    kept = (starts[close] ?? 0) + (lines[close]?.length ?? 0);
    opener.lastIndex = kept;
  }
  return out + text.slice(kept);
}
var closes = (closer, opener) => closer.startsWith(opener.charAt(0)) && closer.length >= opener.length;
function longestAfter(runs, char) {
  const longest = new Array(runs.length + 1).fill(0);
  for (let k = runs.length - 1; k >= 0; k--) {
    const run = runs[k] ?? "";
    longest[k] = Math.max(
      longest[k + 1] ?? 0,
      run.startsWith(char) ? run.length : 0
    );
  }
  return longest;
}
function redact(text) {
  return REDACTIONS.reduce(
    (t, { pattern, replacement }) => t.replace(pattern, replacement),
    text
  );
}
function buildPrompt(task, context) {
  const brief = prepareBrief(task);
  const budget = Math.min(
    BUDGET_CHARS - brief.length - CONTEXT_LABEL.length,
    CONTEXT_CAP_CHARS
  );
  if (context === "" || budget < CONTEXT_MIN_CHARS) return brief;
  return `${brief}${CONTEXT_LABEL}${prepareBrief(context, budget)}`;
}
function descriptionText(description) {
  if (typeof description !== "string") return "";
  const text = redact(description).replace(/\s+/g, " ").trim();
  const cut = text.slice(0, ROLE_CAP);
  return /[\uD800-\uDBFF]$/.test(cut) && text.length > ROLE_CAP ? cut.slice(0, -1) : cut;
}
function roleText(description) {
  return descriptionText(description) || NO_DESCRIPTION;
}
function routingState(raw) {
  return {
    role: roleText(raw.role),
    description: descriptionText(raw.description),
    task: buildPrompt(raw.task, raw.context ?? "")
  };
}

// src/core/parts/part.ts
var LEVELS = [0, 1, 2];
var fromMiddle = (down, up) => (p) => {
  const low = p[0] > down * p[1];
  const high = p[2] > up * p[1];
  if (low && high) return p[0] > p[2] ? 0 : p[2] > p[0] ? 2 : 1;
  return low ? 0 : high ? 2 : 1;
};

// src/core/parts/tier.ts
var TIER_DOWN = 2 ** 0.25;
var TIER_UP = 2 ** 0.5;
var TIER_INSTRUCTIONS = "How much judgment does completing `task` require from an agent whose role is `role`? `description` is the caller's one-line summary of the task.";
var TIER_TEXTS = [
  "Lookup or transcription: the brief names the exact files to read or string to find, or holds the exact code, config or prose to write. It gives the commands to run and the check that proves the work done. No choice is left.",
  "Bounded judgment: the brief fixes the goal and a way to check the result. Check work against stated requirements, fix named defects, implement from a given plan or spec, or answer a question from a few named files.",
  "Open judgment: the brief leaves the approach open. Decide a design, create content with no plan or spec to follow, review a multi-file change for risks no checklist names, or debug with an unclear cause."
];
var tier = {
  key: "tier",
  question: {
    type: "score",
    instructions: TIER_INSTRUCTIONS,
    criteria: TIER_TEXTS
  },
  pick: fromMiddle(TIER_DOWN, TIER_UP)
};

// src/core/parts/work.ts
var WORK_DOWN = 2 ** 1.25;
var WORK_UP = 2 ** 0.5;
var WORK_INSTRUCTIONS = "How much work does completing `task` take for an agent whose role is `role`, once the judgment is settled? Count the steps, the files and the edge cases to verify.";
var WORK_TEXTS = [
  "A short task: one or two mechanical steps in one place, nothing to diagnose, and the given command is the whole check.",
  "An ordinary task: reading or diagnosing code, a few steps or files, and a result to verify.",
  "A long or delicate task: many steps or files, hidden edge cases, or a wrong result that would look right."
];
var work = {
  key: "work",
  question: {
    type: "score",
    instructions: WORK_INSTRUCTIONS,
    criteria: WORK_TEXTS
  },
  pick: fromMiddle(WORK_DOWN, WORK_UP)
};

// src/core/scoring/failure.ts
var ABORTED = { failure: "aborted" };
var TIMED_OUT = { failure: "timed out" };
var NETWORK = { failure: "network" };
var MALFORMED = { failure: "malformed" };
var UNKNOWN = { failure: "unknown" };
var FALLBACK_STATUSES = /* @__PURE__ */ new Set([
  401,
  402,
  403,
  404,
  408,
  429
]);
var SERVER_ERRORS = { min: 500, max: 599 };
var OK = { min: 200, max: 299 };
var isSuccess = (status) => status >= OK.min && status <= OK.max;
var isServerError = (status) => status >= SERVER_ERRORS.min && status <= SERVER_ERRORS.max;
var isFailure = (value) => Object.hasOwn(value, "failure");
function skipText(failure2, aborted) {
  switch (failure2.failure) {
    case "aborted":
      return aborted;
    case "timed out":
      return TIMEOUT;
    case "network":
      return NETWORK_ERROR;
    case "status":
      return httpStatus(failure2.status);
    case "malformed":
      return BAD_REPLY;
    case "unknown":
      return FAILED;
  }
}
function fallsBack(failure2) {
  switch (failure2.failure) {
    case "timed out":
    case "network":
      return true;
    case "status":
      return FALLBACK_STATUSES.has(failure2.status) || isServerError(failure2.status);
    case "aborted":
    case "malformed":
    case "unknown":
      return false;
  }
}

// src/core/scoring/formats/shared.ts
var questionMap = (parts) => Object.fromEntries(parts.map((p) => [p.key, p.question]));
var count = (v) => typeof v === "number" ? v : null;
var usageNamed = (input, output) => (usage) => {
  if (!isRecord(usage)) return void 0;
  return {
    input_tokens: count(usage[input]),
    output_tokens: count(usage[output])
  };
};
var isProbability = (p) => typeof p === "number" && p >= 0 && p <= 1;
function levelProbabilities(p0, p1, p2) {
  if (!isProbability(p0) || !isProbability(p1) || !isProbability(p2))
    return void 0;
  return { 0: p0, 1: p1, 2: p2 };
}
var mapAnswer = (answers, key) => {
  const a = isRecord(answers) ? answers[key] : void 0;
  if (!isRecord(a)) return void 0;
  const { type, probabilities } = a;
  if (type !== "score" || !isRecord(probabilities)) return void 0;
  if (Object.keys(probabilities).length !== LEVELS.length) return void 0;
  const { 0: p0, 1: p1, 2: p2 } = probabilities;
  return levelProbabilities(p0, p1, p2);
};
function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return void 0;
  }
}
var replyReader = (probabilitiesOf, usageOf) => (parts, text) => {
  const reply = parseJson(text);
  const { answers, model, usage } = isRecord(reply) ? reply : {};
  const pairs = [];
  for (const part of parts) {
    const probabilities = probabilitiesOf(answers, part.key);
    if (!probabilities) return MALFORMED;
    pairs.push([part, probabilities]);
  }
  return { answers: pairs, model, usage: usageOf(usage) };
};

// src/core/scoring/formats/system-one.ts
var SYSTEM_ONE = {
  body: (parts, state, model) => JSON.stringify({ state, model, questions: questionMap(parts) }),
  read: replyReader(mapAnswer, usageNamed("input_tokens", "output_tokens"))
};

// src/core/scoring/endpoints.ts
var BEARER = { name: "Authorization", prefix: "Bearer " };
var JEV = "jev-latest";
var ENDPOINTS = {
  typesafe: {
    direct: {
      url: "https://api.typesafe.ai/v1/systemone",
      format: SYSTEM_ONE,
      model: JEV,
      keyHeader: BEARER
    },
    openrouter: {
      url: "https://openrouter.ai/api/v1/systemone",
      format: SYSTEM_ONE,
      model: JEV,
      keyHeader: BEARER
    }
  }
};
function endpointOf(attempt) {
  if (!Object.hasOwn(ENDPOINTS, attempt.maker)) return void 0;
  const rows = ENDPOINTS[attempt.maker];
  return Object.hasOwn(rows, attempt.path) ? rows[attempt.path] : void 0;
}

// src/core/scoring/reply.ts
var MODEL_CHARS_MAX = 40;
var cleanModel = (model) => typeof model === "string" ? model.replace(/[^A-Za-z0-9._/-]/g, "").slice(0, MODEL_CHARS_MAX) : "";

// src/core/scoring/transport/retry.ts
var RETRIES = 2;
var TIMEOUT_MS = 1e4;
var BACKOFF_INITIAL_MS = 500;
var BACKOFF_MAX_MS = 5e3;
var BACKOFF_JITTER = 0.25;
var SERVER_DELAY_MAX_MS = 6e4;
function isRetried(outcome) {
  if (!isFailure(outcome))
    return outcome.status === 408 || outcome.status === 429 || isServerError(outcome.status);
  switch (outcome.failure) {
    case "timed out":
    case "network":
      return true;
    case "aborted":
    case "status":
    case "malformed":
    case "unknown":
      return false;
  }
}
function serverDelayMs(headers) {
  const rawMs = nonEmpty(headers.get("retry-after-ms"));
  const ms = rawMs === void 0 ? Number.NaN : Number(rawMs);
  if (Number.isFinite(ms) && ms >= 0) return ms;
  const raw = nonEmpty(headers.get("retry-after"));
  if (raw === void 0) return void 0;
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) {
    return seconds >= 0 ? seconds * 1e3 : void 0;
  }
  if (!raw.endsWith("GMT")) return void 0;
  const date = Date.parse(raw);
  return Number.isNaN(date) ? void 0 : Math.max(0, date - Date.now());
}
function retryDelayMs(retry, headers) {
  const server = headers === void 0 ? void 0 : serverDelayMs(headers);
  if (server !== void 0 && server <= SERVER_DELAY_MAX_MS) return server;
  const backoff = Math.min(BACKOFF_INITIAL_MS * 2 ** retry, BACKOFF_MAX_MS);
  return Math.round(backoff * (1 - Math.random() * BACKOFF_JITTER));
}

// src/core/scoring/transport/send.ts
async function exchange(fetchFn, url, request, caller, timeout, clock) {
  if (caller.aborted) return { outcome: ABORTED };
  const controller = new AbortController();
  const stopped = new Promise((_, reject) => {
    controller.signal.addEventListener("abort", () => reject(), { once: true });
  });
  const timer = clock.after(timeout, () => controller.abort());
  const cancel = () => controller.abort(caller.reason);
  caller.addEventListener("abort", cancel, { once: true });
  try {
    const reply = await Promise.race([
      fetchFn(url, {
        method: "POST",
        headers: request.headers,
        body: request.body,
        signal: controller.signal
      }),
      stopped
    ]);
    let text;
    try {
      text = await Promise.race([reply.text(), stopped]);
    } catch (error) {
      if (isSuccess(reply.status) || caller.aborted) throw error;
      return {
        outcome: { status: reply.status, text: "" },
        headers: reply.headers
      };
    }
    return { outcome: { status: reply.status, text }, headers: reply.headers };
  } catch {
    if (caller.aborted) return { outcome: ABORTED };
    return { outcome: controller.signal.aborted ? TIMED_OUT : NETWORK };
  } finally {
    timer.cancel();
    caller.removeEventListener("abort", cancel);
  }
}
function pause(ms, caller, clock) {
  if (caller.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      timer.cancel();
      caller.removeEventListener("abort", done);
      resolve();
    };
    const timer = clock.after(ms, done);
    caller.addEventListener("abort", done, { once: true });
  });
}
async function send(fetchFn, url, request, options) {
  const { signal, clock } = options;
  const timeout = options.timeout ?? TIMEOUT_MS;
  const retries = options.retries ?? RETRIES;
  for (let retry = 0; ; retry++) {
    const { outcome, headers } = await exchange(
      fetchFn,
      url,
      request,
      signal,
      timeout,
      clock
    );
    if (retry >= retries || !isRetried(outcome)) return outcome;
    await pause(retryDelayMs(retry, headers), signal, clock);
  }
}

// src/core/scoring/ask.ts
var VERSION = true ? "0.24.3" : "dev";
var USER_AGENT = `model-router/${VERSION} (+https://github.com/Akurganow/model-router)`;
async function askOnce(input, attempt) {
  const { parts, state, fetchFn, clock, signal } = input;
  const endpoint = endpointOf(attempt);
  if (!endpoint) return UNKNOWN;
  const { url, format, model, keyHeader } = endpoint;
  const body = format.body(parts, state, attempt.model ?? model);
  const received = await send(
    fetchFn,
    url,
    {
      headers: {
        [keyHeader.name]: `${keyHeader.prefix}${attempt.key}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT
      },
      body
    },
    {
      signal,
      clock,
      ...attempt.timeout !== void 0 && { timeout: attempt.timeout },
      ...attempt.retries !== void 0 && { retries: attempt.retries }
    }
  );
  if (isFailure(received)) return received;
  if (!isSuccess(received.status))
    return { failure: "status", status: received.status };
  const read = format.read(parts, received.text);
  if (isFailure(read)) return read;
  return {
    answers: read.answers,
    model: cleanModel(read.model),
    usage: read.usage
  };
}
async function ask(input, attempt) {
  try {
    return await askOnce(input, attempt);
  } catch {
    return UNKNOWN;
  }
}

// src/core/scoring/route.ts
async function route(input) {
  const { attempts, signal } = input;
  if ("skipped" in attempts) return attempts;
  if (attempts.length === 0) return { skipped: KEY_UNSET };
  const failed = [];
  for (const [i, attempt] of attempts.entries()) {
    const result = await ask(input, attempt);
    if (isFailure(result)) {
      failed.push({
        holder: attempt.holder,
        reason: skipText(result, abortCategory(signal))
      });
      if (!fallsBack(result)) break;
      if (i < attempts.length - 1) input.onFallback?.(attempt.holder);
      continue;
    }
    const decision = toDecision(result, attempt.holder);
    const [first] = failed;
    return first ? { ...decision, firstFailed: first } : decision;
  }
  return skip(failed);
}
function skip(failed) {
  const [first, ...rest] = failed;
  if (!first || rest.length === 0) return { skipped: first?.reason ?? FAILED };
  return { skipped: failed.map(failedAttemptText).join(", ") };
}
function toDecision({ answers, model, usage }, holder) {
  const parts = {};
  for (const [part, probabilities] of answers)
    parts[part.key] = { level: part.pick(probabilities), probabilities };
  return { parts, holder, model, usage };
}

// src/core/decision/decide.ts
var BAD = { skipped: BAD_REPLY };
var levelOf = (decision, key) => {
  const part = decision.parts[key];
  return part && {
    level: part.level,
    probability: formatProbability(part.probabilities[part.level])
  };
};
function decide(decision, tierKey, workKey) {
  if ("skipped" in decision) return decision;
  const tier2 = levelOf(decision, tierKey);
  if (!tier2) return BAD;
  const work2 = levelOf(decision, workKey);
  if (!work2) return BAD;
  return {
    tier: tier2.level,
    work: work2.level,
    probabilities: `${tier2.probability}/${work2.probability}`,
    suffix: decisionSuffix({
      holder: decision.holder,
      model: decision.model,
      inputTokens: decision.usage?.input_tokens,
      outputTokens: decision.usage?.output_tokens,
      failed: decision.firstFailed
    })
  };
}
async function scoreWork(input) {
  const decision = await route({ ...input, parts: [tier, work] });
  return decide(decision, tier.key, work.key);
}

// src/core/decision/ladder.ts
var EFFORT_BY_TIER = {
  0: ["medium", "high", "xhigh"],
  1: ["low", "medium", "high"],
  2: ["low", "medium", "high"]
};
var effortFor = (tier2, work2) => EFFORT_BY_TIER[tier2][work2];

// src/core/decision/outcome.ts
function outcomeOf(decided, models, kept) {
  const picked = pickModel(
    decided.tier,
    slotState(models[slotForLevel(decided.tier)])
  );
  const ladder = effortFor(decided.tier, decided.work);
  return {
    slot: picked.slot,
    model: picked.model,
    effort: kept === void 0 ? ladder : void 0,
    line: routedLine({
      level: decided.tier,
      target: picked.target,
      effort: kept ?? ladder,
      probabilities: decided.probabilities,
      suffix: decided.suffix
    })
  };
}

// src/adapters/openclaw/agents.ts
var DEFAULT_AGENT_ID = "main";
var MAX_ID_LENGTH = 64;
var VALID_ID = new RegExp(
  `^[a-z0-9][a-z0-9_-]{0,${MAX_ID_LENGTH - 1}}$`,
  "i"
);
var INVALID_CHARS = /[^a-z0-9_-]+/g;
var LEADING_DASHES = /^-+/;
var TRAILING_DASHES = /-+$/;
function normalizeAgentId(value) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  const lower = trimmed.toLowerCase();
  if (VALID_ID.test(trimmed)) return lower;
  const id = lower.replace(INVALID_CHARS, "-").replace(LEADING_DASHES, "").replace(TRAILING_DASHES, "").slice(0, MAX_ID_LENGTH);
  return id === "" ? DEFAULT_AGENT_ID : id;
}
var sameAgent = (a, b) => normalizeAgentId(a) === normalizeAgentId(b);
function findAgent(config, id) {
  const agents = config?.agents;
  if (id === void 0 || !isRecord(agents)) return void 0;
  const wanted = normalizeAgentId(id);
  const { entries, list } = agents;
  if (entries !== void 0) {
    if (!isRecord(entries)) return void 0;
    const key = Object.keys(entries).find(
      (candidate) => isRecord(entries[candidate]) && normalizeAgentId(candidate) === wanted
    );
    return key === void 0 ? void 0 : entries[key];
  }
  if (!Array.isArray(list)) return void 0;
  return list.filter(isRecord).find(({ id: itemId }) => normalizeAgentId(itemId) === wanted);
}

// src/adapters/openclaw/gates.ts
var PASS = { outcome: "pass" };
var skip2 = (reason) => ({ outcome: "skip", reason });
var NO_MODEL_VALUE = "default";
function at(value, ...path) {
  let node = value;
  for (const key of path) {
    if (!isRecord(node) || !Object.hasOwn(node, key)) return void 0;
    node = node[key];
  }
  return node;
}
var agentField = (config, id, ...path) => at(findAgent(config, id), ...path);
var namesModel = (model) => model !== void 0 && model.toLowerCase() !== NO_MODEL_VALUE;
function passesSilently(spawn) {
  return namesModel(spawn.model) || spawn.runtime === "other" || spawn.agent.kind === "invalid" || spawn.visible || spawn.context === "fork" || spawn.mode === "session" || spawn.thread;
}
function otherAgentSkip(id, { config }) {
  if (config === void 0) return agentDiscoveryFailed(id);
  const entry = findAgent(config, id);
  if (entry === void 0) return agentUnknown(id);
  return isSet(at(entry, "model")) ? setsOwnModel(id) : void 0;
}
function subagentModelSet(input, target) {
  return isSet(agentField(input.config, target, "subagents", "model")) || isSet(at(input.config, "agents", "defaults", "subagents", "model"));
}
function effortRule(input, { scope }) {
  const { spawn, config, requester } = input;
  if (spawn.thinking !== void 0)
    return { kind: "keep", label: CALLER_EFFORT };
  const global = at(config, "agents", "defaults", "subagents", "thinking");
  const requesterThinking = agentField(
    config,
    requester,
    "subagents",
    "thinking"
  );
  const kept = isSet(global) || scope === "core" && isSet(requesterThinking);
  return kept ? { kind: "keep", label: CONFIG_EFFORT } : { kind: "set" };
}
function roleOf(input, target, blank) {
  const description = agentField(input.config, target, "description");
  return nonEmpty(description) === void 0 ? blank : roleText(description);
}
function gateSpawn(input) {
  const { spawn, requester, settings, config } = input;
  const { task } = spawn;
  if (task === void 0 || passesSilently(spawn)) return PASS;
  const named = spawn.agent.kind === "id" ? spawn.agent.id : void 0;
  const isRequesterSpawn = named === void 0 || requester !== void 0 && sameAgent(named, requester);
  const target = isRequesterSpawn ? requester : named;
  if ("skipped" in settings) return skip2(settings.skipped);
  if (!input.hasKey) return skip2(KEY_UNSET);
  if (!isRequesterSpawn && settings.scope === "core")
    return skip2(outsideCoreScope(named));
  if (subagentModelSet(input, target)) return skip2(SUBAGENT_MODEL_SET);
  if (!isRequesterSpawn) {
    const reason = otherAgentSkip(named, input);
    if (reason !== void 0) return skip2(reason);
  }
  if (config === void 0) return skip2(UNREADABLE);
  return {
    outcome: "route",
    target,
    role: roleOf(
      input,
      target,
      isRequesterSpawn ? DEFAULT_ROLE : NO_DESCRIPTION
    ),
    effort: effortRule(input, settings),
    task,
    description: spawn.description
  };
}

// src/adapters/openclaw/params.ts
var snakeCase = (key) => key.replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2").replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
function readParam(params, key) {
  if (Object.hasOwn(params, key)) return params[key];
  const snake = snakeCase(key);
  return Object.hasOwn(params, snake) ? params[snake] : void 0;
}
var readStringParam = (params, key) => nonEmpty(readParam(params, key));
var SUBAGENT_RUNTIME = "subagent";
function readAgent(params) {
  const raw = readParam(params, "agentId");
  if (typeof raw !== "string")
    return isSet(raw) ? { kind: "invalid" } : { kind: "none" };
  const id = nonEmpty(raw);
  return id === void 0 ? { kind: "none" } : { kind: "id", id };
}
function readRuntime(params) {
  const { runtime } = params;
  if (!isSet(runtime)) return void 0;
  return runtime === SUBAGENT_RUNTIME ? SUBAGENT_RUNTIME : "other";
}
function readSpawn(params) {
  const { task, taskName, visible, context, mode, thread } = params;
  return {
    task: typeof task === "string" ? task : void 0,
    agent: readAgent(params),
    model: readStringParam(params, "model"),
    thinking: readStringParam(params, "thinking"),
    description: readStringParam(params, "label") ?? nonEmpty(taskName) ?? "",
    runtime: readRuntime(params),
    visible: visible === true,
    context: context === "fork" || context === "isolated" ? context : void 0,
    mode: mode === "run" || mode === "session" ? mode : void 0,
    thread: thread === true
  };
}

// src/adapters/openclaw/router.ts
var SPAWN_TOOL = "sessions_spawn";
var HOOK = "before_tool_call";
function spawnLine(api, signal) {
  let open = true;
  const onAbort = () => {
    if (!open) return;
    open = false;
    try {
      api.logger.info(LINE_PREFIX + skippedLine(abortCategory(signal)));
    } catch {
    }
  };
  if (signal.aborted) onAbort();
  else signal.addEventListener("abort", onAbort, { once: true });
  return {
    log: (message) => {
      if (!open) return;
      open = false;
      api.logger.info(LINE_PREFIX + message);
    },
    close: () => {
      open = false;
      signal.removeEventListener("abort", onAbort);
    }
  };
}
async function score({ deps, signal }, { chosen, keys }, gate) {
  return scoreWork({
    state: routingState({
      role: gate.role,
      description: gate.description,
      task: gate.task
    }),
    attempts: plan(chosen, keys),
    fetchFn: deps.fetchFn,
    clock: realClock,
    signal
  });
}
async function routeSpawn(spawn) {
  const { api, deps, signal, request, requester } = spawn;
  const state = readState(api, deps.env);
  const gate = gateSpawn({
    spawn: request,
    requester,
    config: state.config,
    settings: state.chosen,
    hasKey: Object.keys(state.keys).length > 0
  });
  if (gate.outcome === "pass") return void 0;
  const { log, close } = spawnLine(api, signal);
  try {
    return await routeGated(spawn, state, gate, log);
  } finally {
    close();
  }
}
async function routeGated(spawn, state, gate, log) {
  if (gate.outcome === "skip") return void log(skippedLine(gate.reason));
  const decided = await score(spawn, state, gate);
  if ("skipped" in decided) return void log(skippedLine(decided.skipped));
  const { model, effort, line } = outcomeOf(
    decided,
    state.settings.models,
    gate.effort.kind === "keep" ? gate.effort.label : void 0
  );
  log(line);
  const set = {
    ...model === void 0 ? {} : { model },
    ...effort === void 0 ? {} : { thinking: effort }
  };
  return Object.keys(set).length === 0 ? void 0 : { params: set };
}
function createBeforeToolCall(api, deadlineMs, deps) {
  return async (event, ctx) => {
    try {
      if (deadlineMs < MIN_DEADLINE_MS || event?.toolName !== SPAWN_TOOL)
        return void 0;
      const requester = nonEmpty(ctx?.agentId);
      const request = readSpawn(event.params);
      return await raceDeadline(
        (signal) => routeSpawn({ api, deps, signal, request, requester }),
        deadlineMs,
        deps.clock,
        ctx?.abortSignal
      );
    } catch {
      return void 0;
    }
  };
}

// src/adapters/openclaw/index.ts
var HOOK_TIMEOUT_MAX_MS = 6e5;
var HOOK_TIMEOUT_MS = ROUTING_LIMIT_MS + HANDLER_MARGIN_MS;
var usable = (value) => typeof value === "number" && Number.isInteger(value) && value > 0 && value <= HOOK_TIMEOUT_MAX_MS;
function effectiveTimeout(config) {
  const hooks = pluginEntry(config)?.hooks;
  const perHook = isRecord(hooks?.timeouts) ? hooks.timeouts.before_tool_call : void 0;
  return [perHook, hooks?.timeoutMs].find(usable) ?? HOOK_TIMEOUT_MS;
}
function warn(api, message) {
  try {
    api.logger.warn(LINE_PREFIX + message);
  } catch {
  }
}
var TOOL_MODES = [
  "full",
  "discovery",
  "tool-discovery"
];
var COMMAND_MODES = ["full", "discovery"];
var HOOK_MODES = ["full", "discovery"];
function registerRouting(api, deps) {
  const timeout = effectiveTimeout(api.config);
  const deadline = deadlineFor(timeout);
  if (api.registrationMode === "full" && deadline < MIN_DEADLINE_MS)
    warn(
      api,
      `the hook timeout is ${timeout} ms, which leaves ${deadline} ms to route; the plugin routes nothing. Set it to ${MIN_TIMEOUT_MS} ms or more.`
    );
  api.on(HOOK, createBeforeToolCall(api, deadline, deps), {
    matcher: [SPAWN_TOOL],
    priority: 100,
    timeoutMs: HOOK_TIMEOUT_MS
  });
}
function register(api, deps) {
  try {
    const mode = api.registrationMode;
    if (TOOL_MODES.includes(mode)) registerConfigTool(api, deps.env);
    if (COMMAND_MODES.includes(mode)) registerConfigCommands(api, deps.env);
    if (HOOK_MODES.includes(mode)) registerRouting(api, deps);
  } catch {
    warn(api, "registration failed; the plugin is inert.");
  }
}
function createPlugin(deps = {
  // A lookup at each call, so a host that replaces the global fetch later is not bypassed.
  fetchFn: (url, init) => fetch(url, init),
  clock: realClock,
  env: process.env
}) {
  return { id: PLUGIN_ID, register: (api) => register(api, deps) };
}
var index_default = createPlugin();
export {
  createPlugin,
  index_default as default
};
