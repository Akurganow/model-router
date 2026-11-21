// src/core/output/reasons.ts
var CALLER_EFFORT = "caller effort";
var KEY_UNSET = "key unset";
var BAD_REPLY = "bad reply";
var TIMEOUT = "timeout";
var FAILED = "failed";
var NETWORK_ERROR = "network error";
var httpStatus = (status) => `HTTP ${status}`;
var CANCELLED = "cancelled";
var notValid = (setting) => `${setting} not valid: run setup`;
var failedAttemptText = (f) => `${f.holder} ${f.reason}`;

// src/core/providers/provider.ts
var MAKERS = ["typesafe"];
var KEY_HOLDERS = [...MAKERS, "openrouter"];
var GATEWAYS = [
  "direct",
  "auto",
  "openrouter-first",
  "openrouter"
];
var KEY_FIELDS = {
  typesafe: "api_key",
  openrouter: "openrouter_api_key"
};
var FIRST_ATTEMPT_TIMEOUT_MS = 5e3;
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
async function collectKeys(choice, lookup) {
  const keys = {};
  for (const holder of holders(choice)) {
    const key = await lookup(holder);
    if (key !== void 0) keys[holder] = key;
  }
  return keys;
}
function plan(choice, keys) {
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
var DEFAULT_SCOPE = "core";

// src/core/options/settings.ts
var VALUE_SETTINGS = ["provider", "gateway", "scope"];
var LABEL_SEPARATOR = " - ";
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
var isValueSetting = (name) => VALUE_SETTINGS.some((known) => known === name);
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
var scopeOf = (stored) => readScope(stored.scope) ?? DEFAULT_SCOPE;
var useOneOf = (setting) => `${setting}: use one of ${TEXTS[setting].values.join(", ")}`;
var unchanged = (setting, reason) => `${setting} unchanged: ${reason}`;
var unchangedBy = (setting, err) => unchanged(setting, errorText(err));
var alreadyValue = (value) => `already ${value}`;
var NO_ANSWER = "no answer from the dialog";
var NOT_OFFERED = "the answer was not one of the offered values";
var keyLine = (holder, state) => `${holder} key: ${state}`;
var label = (setting, value) => `${value}${LABEL_SEPARATOR}${TEXTS[setting].consequences[value]}`;
function ask(setting, current2) {
  const { values, question } = TEXTS[setting];
  const first = valueFor(setting, current2);
  const sorted = first === void 0 ? values : [first, ...values.filter((value) => value !== first)];
  return { question, options: sorted.map((value) => label(setting, value)) };
}
function pick(setting, answer2) {
  return TEXTS[setting].values.find(
    (value) => label(setting, value) === answer2
  );
}
async function chooseValue(setting, current2, select, apply) {
  const { question, options } = ask(setting, current2);
  let answer2;
  try {
    answer2 = await select(question, options);
  } catch {
    answer2 = void 0;
  }
  if (answer2 === void 0) return unchanged(setting, NO_ANSWER);
  const value = pick(setting, answer2);
  return value === void 0 ? unchanged(setting, NOT_OFFERED) : apply(value);
}
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
var toolDescription = () => `Reads the router's settings. With no input it returns the provider, gateway and scope, and whether each key the settings allow is set. With a setting name (${VALUE_SETTINGS.join(", ")}) the plugin asks the person in its own dialog and writes their choice. Never pass a value or a key. The person picks the value in the dialog.`;
var badCall = () => `Unknown setting. Pass no setting, or one of: ${VALUE_SETTINGS.join(", ")}`;
function describeCommand(setting) {
  const { about, values } = TEXTS[setting];
  return `Shows or changes ${about}: ${values.join(", ")}.`;
}
var COMMAND_DESCRIPTIONS = {
  provider: describeCommand("provider"),
  gateway: describeCommand("gateway"),
  scope: describeCommand("scope")
};

// src/utils/serializer.ts
function serializer() {
  let tail = Promise.resolve();
  return (job) => {
    const run = tail.then(job);
    tail = run.catch(() => void 0);
    return run;
  };
}

// src/adapters/claude/host.ts
var EFFORTS_MAX = 1024;
function passOn(_, e, next) {
  return next(e);
}
async function* passStep(_, e, next) {
  return yield* next(e);
}
async function denied($, call) {
  const {
    tool,
    tool_use_id: _id,
    agentId: _agentId,
    requestMeta: _meta,
    ...input
  } = call;
  return (await $.tool.check({ tool, input })).decision === "deny";
}

// src/utils/text.ts
var nonEmpty = (value) => {
  const text = typeof value === "string" ? value.trim() : "";
  return text === "" ? void 0 : text;
};

// src/adapters/claude/keys.ts
async function readKeys($, options, choice) {
  return collectKeys(
    choice,
    async (holder) => nonEmpty(options[KEY_FIELDS[holder]]) ?? nonEmpty(await keyVariable($, holder))
  );
}
function keyVariable($, holder) {
  switch (holder) {
    case "typesafe":
      return $.env.get("TYPESAFE_API_KEY");
    case "openrouter":
      return $.env.get("OPENROUTER_API_KEY");
  }
}

// src/adapters/claude/config.ts
var ROW_PREFIX = "model-router.";
var REFUSED = "Permission rules deny this tool, so nothing was read or changed.";
var PERSON = "composer";
var TOOL_SPEC = {
  name: "config",
  description: toolDescription(),
  inputSchema: {
    type: "object",
    properties: { setting: { type: "string", enum: VALUE_SETTINGS } }
  }
};
var written = {};
var serial = serializer();
function resetConfig() {
  for (const setting of VALUE_SETTINGS) delete written[setting];
  serial = serializer();
}
var current = (options, setting) => written[setting] ?? options[setting];
var storedOf = (options) => ({
  provider: current(options, "provider"),
  gateway: current(options, "gateway"),
  scope: current(options, "scope")
});
async function registerConfigTool($, e, next) {
  await $.tool.register(TOOL_SPEC);
  return next(e);
}
async function write($, options, setting, value) {
  try {
    const { deny } = await $.config.set({
      key: `${ROW_PREFIX}${setting}`,
      value
    });
    if (deny !== void 0) return unchanged(setting, deny);
    written[setting] = value;
    return valueLine(setting, storedOf(options));
  } catch (err) {
    return unchangedBy(setting, err);
  }
}
async function choose($, setting, options) {
  return chooseValue(
    setting,
    current(options, setting),
    (question, labels) => $.ui.ask(question, { options: labels, header: setting }),
    async (value) => value === current(options, setting) ? unchanged(setting, alreadyValue(value)) : write($, options, setting, value)
  );
}
async function read($, options) {
  const stored = storedOf(options);
  const keys = await readKeys($, options, settingsOf(stored));
  return settingsReport(stored, [], keys);
}
async function answer($, call, options) {
  if (await denied($, call)) return { deny: REFUSED };
  const { setting } = call;
  if (setting === void 0) return { result: await read($, options) };
  if (isValueSetting(setting))
    return { result: await choose($, setting, options) };
  return { result: badCall() };
}
function configCall($, call, options) {
  return serial(() => answer($, call, options));
}
async function configCommand($, e, setting, options) {
  const args = e.args.trim();
  if (args !== "" && !isValue(setting, args))
    return { text: useOneOf(setting) };
  if (args === "" || e.origin.kind !== PERSON)
    return { text: valueLine(setting, storedOf(options)) };
  return { text: await write($, options, setting, args) };
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

// src/core/output/line.ts
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
function skipText(failure, aborted) {
  switch (failure.failure) {
    case "aborted":
      return aborted;
    case "timed out":
      return TIMEOUT;
    case "network":
      return NETWORK_ERROR;
    case "status":
      return httpStatus(failure.status);
    case "malformed":
      return BAD_REPLY;
    case "unknown":
      return FAILED;
  }
}
function fallsBack(failure) {
  switch (failure.failure) {
    case "timed out":
    case "network":
      return true;
    case "status":
      return FALLBACK_STATUSES.has(failure.status) || isServerError(failure.status);
    case "aborted":
    case "malformed":
    case "unknown":
      return false;
  }
}

// src/utils/guards.ts
var isRecord = (v) => typeof v === "object" && v !== null;

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
  const read2 = format.read(parts, received.text);
  if (isFailure(read2)) return read2;
  return {
    answers: read2.answers,
    model: cleanModel(read2.model),
    usage: read2.usage
  };
}
async function ask2(input, attempt) {
  try {
    return await askOnce(input, attempt);
  } catch {
    return UNKNOWN;
  }
}

// src/core/scoring/limit.ts
var ROUTING_LIMIT_MS = 1e4;
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

// src/core/scoring/route.ts
async function route(input) {
  const { attempts, signal } = input;
  if (attempts.length === 0) return { skipped: KEY_UNSET };
  const failed = [];
  for (const [i, attempt] of attempts.entries()) {
    const result = await ask2(input, attempt);
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

// src/core/decision/slots.ts
var SLOTS = ["small", "middle", "large"];
var slotForLevel = (level) => SLOTS[level];
var slotSetting = (slot) => `${slot}_model`;
var SLOT_SETTINGS = SLOTS.map(slotSetting);
var slotState = (model) => model === void 0 ? { state: "unset" } : { state: "set", model };
function pickModel(level, state) {
  const slot = slotForLevel(level);
  return state.state === "set" ? { slot, model: state.model, target: state.model } : { slot, model: void 0, target: `${slot} model unset` };
}

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

// src/adapters/claude/router.ts
var MODELS = { small: "haiku", middle: "sonnet", large: "opus" };
var BUILT_IN = "built-in";
var ENGINE = "engine";
var GENERAL_PURPOSE = "general-purpose";
var CLAUDE_AGENT = "claude";
var FORK = "fork";
var DEFAULT_ROLE_AGENTS = /* @__PURE__ */ new Set([
  GENERAL_PURPOSE,
  CLAUDE_AGENT
]);
var ROUTED_AGENTS = /* @__PURE__ */ new Set([
  ...DEFAULT_ROLE_AGENTS,
  "Explore",
  "Plan"
]);
var DEBUG_PIECE_CHARS = 9e3;
var offered = /* @__PURE__ */ new Map();
var callerEffort = /* @__PURE__ */ new Set();
var efforts = /* @__PURE__ */ new Map();
var starting = /* @__PURE__ */ new Set();
var waited = /* @__PURE__ */ new Set();
var STEP_WAIT_MS = 1e3;
function resetRouting() {
  offered.clear();
  callerEffort.clear();
  efforts.clear();
  starting.clear();
  waited.clear();
}
function noteOffer(agent, source, description) {
  offered.set(agent, { source, description });
}
function forgetWaited(agentId) {
  waited.delete(agentId);
}
async function noteCallerEffort(_, e, next) {
  const id = e.tool_use_id;
  if (id !== void 0 && e.effort !== void 0) callerEffort.add(id);
  try {
    const outcome = await next(e);
    if (id !== void 0 && (outcome.deny !== void 0 || outcome.isError))
      callerEffort.delete(id);
    return outcome;
  } catch (error) {
    if (id !== void 0) callerEffort.delete(id);
    throw error;
  }
}
function routable(spawn, scope) {
  const agent = spawn.subagentType;
  if (spawn.name !== void 0 || spawn.model !== void 0) return false;
  if (spawn.fork || spawn.isTeammate || spawn.resume || spawn.workflow)
    return false;
  if (scope === "extended") return agent !== FORK;
  return ROUTED_AGENTS.has(agent) && offered.get(agent)?.source === BUILT_IN;
}
function roleFor(agent) {
  const offer = offered.get(agent);
  const own = offer === void 0 || offer.source === BUILT_IN;
  return DEFAULT_ROLE_AGENTS.has(agent) && own ? DEFAULT_ROLE : roleText(offer?.description);
}
async function routeSpawn($, spawn, next, options) {
  const callerSet = callerEffort.delete(spawn.tool_use_id);
  const settings = settingsOf(options);
  if (next.origin.plugin !== ENGINE || !routable(spawn, scopeOf(options)))
    return next(spawn);
  if ("skipped" in settings) {
    await $.ui.log(skippedLine(settings.skipped));
    return next(spawn);
  }
  const state = routingState({
    role: roleFor(spawn.subagentType),
    description: spawn.description,
    task: spawn.prompt
  });
  const keys = await readKeys($, options, settings);
  const decided = await scored($, next.signal, {
    state,
    attempts: plan(settings, keys)
  });
  if ("skipped" in decided) {
    await $.ui.log(skippedLine(decided.skipped));
    return next(spawn);
  }
  const kept = callerSet ? CALLER_EFFORT : await $.env.get("CLAUDE_CODE_EFFORT_LEVEL") ? "env effort" : void 0;
  const { model, effort, line } = outcomeOf(decided, MODELS, kept);
  await $.ui.log(line);
  const started = next(model === void 0 ? spawn : { ...spawn, model });
  if (effort !== void 0) track(started, effort);
  const outcome = await started;
  if (outcome.deny !== void 0) await $.ui.log("denied");
  return outcome;
}
function track(started, effort) {
  const settled = started.then(
    ({ agentId }) => {
      if (agentId === void 0) return;
      const leastRecent = efforts.keys().next();
      if (efforts.size >= EFFORTS_MAX && !leastRecent.done)
        efforts.delete(leastRecent.value);
      efforts.set(agentId, effort);
    },
    () => void 0
  );
  starting.add(settled);
  settled.finally(() => starting.delete(settled));
}
async function* stepEffort($, e, next) {
  if (e.agentId !== void 0 && !efforts.has(e.agentId) && !waited.has(e.agentId)) {
    waited.add(e.agentId);
    await spawnsSettled($);
  }
  const effort = routedEffort(e.agentId);
  if (effort === void 0 || e.effort === void 0) return yield* next(e);
  return yield* next({ ...e, effort });
}
function routedEffort(agentId) {
  if (agentId === void 0) return void 0;
  const effort = efforts.get(agentId);
  if (effort === void 0) return void 0;
  efforts.delete(agentId);
  efforts.set(agentId, effort);
  return effort;
}
async function spawnsSettled($) {
  if (starting.size === 0) return;
  const stop = new AbortController();
  try {
    await Promise.race([
      Promise.all(starting),
      $.clock.sleep(STEP_WAIT_MS, { signal: stop.signal }).catch(() => {
      })
    ]);
  } finally {
    stop.abort();
  }
}
async function scored($, cancel, input) {
  const clock = {
    after: (ms, fn) => $.clock.after(ms, fn)
  };
  const limit = limitSignal(ROUTING_LIMIT_MS, clock, cancel);
  try {
    return await scoreWork({
      ...input,
      fetchFn: engineFetch($),
      clock,
      signal: limit.signal
    });
  } finally {
    limit.disarm();
  }
}
function engineFetch($) {
  return async (url, init) => {
    const { body } = init;
    await logRequest($, body);
    const reply = await $.http.fetch(url, {
      method: init.method,
      headers: init.headers,
      body
    });
    return toReply(reply);
  };
}
async function logRequest($, body) {
  const pieces = Math.ceil(body.length / DEBUG_PIECE_CHARS);
  for (let i = 0; i < pieces; i++)
    await $.ui.log(
      `request ${i + 1}/${pieces} ${body.slice(i * DEBUG_PIECE_CHARS, (i + 1) * DEBUG_PIECE_CHARS)}`,
      { to: "debug" }
    );
}
function toReply({
  status,
  headers,
  text
}) {
  return {
    status,
    headers: { get: (name) => headers[name.toLowerCase()] ?? null },
    text: async () => text
  };
}

// src/adapters/claude/index.ts
function register(on, options) {
  resetRouting();
  on("agent.offer", (_, e, next) => {
    noteOffer(e.agent, e.source, e.description);
    return next(e);
  }).catch(passOn);
  on("tool.call", { tool: "Agent" }, noteCallerEffort).catch(passOn);
  on("agent.spawn", ($, e, next) => routeSpawn($, e, next, options)).catch(
    passOn
  );
  on("turn.step", stepEffort).catch(passStep);
  on("turn.complete", (_, e, next) => {
    if (e.agentId !== void 0) forgetWaited(e.agentId);
    return next(e);
  }).catch(passOn);
  resetConfig();
  on("session.start", registerConfigTool).catch(passOn);
  on(
    "tool.call",
    { tool: "mcp__model-router__config" },
    ($, e) => configCall($, e, options)
  );
  on(
    "command.run",
    { command: "model-router:gateway" },
    ($, e) => configCommand($, e, "gateway", options)
  );
  on(
    "command.run",
    { command: "model-router:provider" },
    ($, e) => configCommand($, e, "provider", options)
  );
  on(
    "command.run",
    { command: "model-router:scope" },
    ($, e) => configCommand($, e, "scope", options)
  );
}
export {
  register
};
