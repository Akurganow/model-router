// src/adapters/omp/index.ts
import { lookup } from "@oh-my-pi/pi-coding-agent/config/registry";
import { getPluginSettings } from "@oh-my-pi/pi-coding-agent/extensibility/plugins/loader";
import { getPluginsLockfile } from "@oh-my-pi/pi-utils";

// src/adapters/omp/name.ts
import { readFileSync } from "node:fs";

// src/utils/text.ts
var nonEmpty = (value) => {
  const text = typeof value === "string" ? value.trim() : "";
  return text === "" ? void 0 : text;
};

// src/utils/guards.ts
var isRecord = (v) => typeof v === "object" && v !== null;
var isPositiveNumber = (v) => typeof v === "number" && Number.isFinite(v) && v > 0;
var isSet = (v) => typeof v === "string" ? nonEmpty(v) !== void 0 : v !== void 0 && v !== null;

// src/adapters/omp/name.ts
var FALLBACK_NAME = "model-router-omp";
function readInstalledName(moduleUrl) {
  try {
    const manifest = JSON.parse(
      readFileSync(new URL("../package.json", moduleUrl), "utf8")
    );
    const { name } = isRecord(manifest) ? manifest : {};
    return typeof name === "string" && name !== "" ? name : void 0;
  } catch {
    return void 0;
  }
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
function contextText(context) {
  return typeof context === "string" && nonEmpty(context) !== void 0 ? context : "";
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

// src/core/options/scope.ts
var SCOPE_VALUES = ["core", "extended"];
var DEFAULT_SCOPE = SCOPE_VALUES[0];

// src/core/output/reasons.ts
var CALLER_EFFORT = "caller effort";
var CONFIG_EFFORT = "config effort";
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

// src/core/providers/provider.ts
var MAKERS = ["typesafe", "openai", "google"];
var KEY_HOLDERS = [...MAKERS, "openrouter"];
var GATEWAYS = [
  "direct",
  "auto",
  "openrouter-first",
  "openrouter"
];
var KEY_VARIABLES = {
  typesafe: "TYPESAFE_API_KEY",
  openai: "OPENAI_API_KEY",
  google: "GEMINI_API_KEY",
  openrouter: "OPENROUTER_API_KEY"
};
var FIRST_ATTEMPT_TIMEOUT_MS = 5e3;
var GATEWAY_PATHS = {
  direct: ["direct"],
  auto: ["direct", "openrouter"],
  "openrouter-first": ["openrouter", "direct"],
  openrouter: ["openrouter"]
};
var narrowsGateway = (narrowed, wider) => GATEWAY_PATHS[narrowed].length < GATEWAY_PATHS[wider].length && GATEWAY_PATHS[narrowed].every((path) => GATEWAY_PATHS[wider].includes(path));
var modelOfChoice = (choice) => {
  const model = choice.models?.[choice.provider];
  return typeof model === "string" ? { model } : {};
};
var holderOf = (maker, path) => path === "direct" ? maker : path;
var steps = (choice) => GATEWAY_PATHS[choice.gateway].map((path) => ({
  maker: choice.provider,
  path,
  holder: holderOf(choice.provider, path)
}));
var holders = (choice) => "skipped" in choice ? [] : steps(choice).map((step) => step.holder);
async function collectKeys(choice, lookup2) {
  const keys = {};
  for (const holder of holders(choice)) {
    const key = await lookup2(holder);
    if (key !== void 0) keys[holder] = key;
  }
  return keys;
}
function plan(choice, keys) {
  const attempts = [];
  for (const step of steps(choice)) {
    const key = keys[step.holder];
    if (key) attempts.push({ ...step, key, ...modelOfChoice(choice) });
  }
  return attempts.map(
    (attempt2, i) => i < attempts.length - 1 ? { ...attempt2, timeout: FIRST_ATTEMPT_TIMEOUT_MS, retries: 0 } : attempt2
  );
}

// src/core/parts/part.ts
var LEVELS = [0, 1, 2];
var fromMiddle = (down, up) => (p) => {
  const low = p[0] > down * p[1];
  const high = p[2] > up * p[1];
  if (low && high) return p[0] > p[2] ? 0 : p[2] > p[0] ? 2 : 1;
  return low ? 0 : high ? 2 : 1;
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

// src/core/scoring/formats/shared.ts
var stateText = (state) => JSON.stringify(state);
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
  const reply2 = parseJson(text);
  const { answers, model, usage } = isRecord(reply2) ? reply2 : {};
  const pairs = [];
  for (const part of parts) {
    const probabilities = probabilitiesOf(answers, part.key);
    if (!probabilities) return MALFORMED;
    pairs.push([part, probabilities]);
  }
  return { answers: pairs, model, usage: usageOf(usage) };
};

// src/core/scoring/formats/gemini-decisions.ts
var GEMINI_DECISIONS = {
  body: (parts, state, model) => JSON.stringify({
    model,
    input: stateText(state),
    questions: questionMap(parts)
  }),
  read: replyReader(
    mapAnswer,
    usageNamed("total_input_tokens", "total_output_tokens")
  )
};

// src/core/scoring/formats/openrouter-decisions.ts
var OPENROUTER_DECISIONS = {
  body: (parts, state, model) => JSON.stringify({
    state: stateText(state),
    model,
    questions: questionMap(parts)
  }),
  read: replyReader(mapAnswer, usageNamed("input_tokens", "output_tokens"))
};

// src/core/scoring/maker-module.ts
var BEARER = { name: "Authorization", prefix: "Bearer " };

// src/core/scoring/makers/google.ts
var GOOGLE_KEY = { name: "x-goog-api-key", prefix: "" };
var google = {
  vendor: "google",
  openrouterRoute: "decisions",
  openrouterNames: { "gemini-decision-1": "google/gemini-decision-1" },
  paths: {
    direct: {
      url: "https://generativelanguage.googleapis.com/v1beta/decisions",
      format: GEMINI_DECISIONS,
      model: "gemini-decision-1",
      keyHeader: GOOGLE_KEY
    },
    openrouter: {
      url: "https://openrouter.ai/api/alpha/decisions",
      format: OPENROUTER_DECISIONS,
      model: "google/gemini-decision-1",
      keyHeader: BEARER
    }
  }
};

// src/core/scoring/formats/openai-decisions.ts
function listAnswer(answers, key) {
  if (!Array.isArray(answers)) return void 0;
  const [item, ...others] = answers.filter(isRecord).filter(({ name }) => name === key);
  if (!item || others.length > 0) return void 0;
  const { type, probabilities } = item;
  if (type !== "score" || !Array.isArray(probabilities)) return void 0;
  if (probabilities.length !== LEVELS.length) return void 0;
  const byValue = /* @__PURE__ */ new Map();
  for (const entry2 of probabilities) {
    if (!isRecord(entry2)) return void 0;
    const { value, probability } = entry2;
    byValue.set(value, probability);
  }
  return levelProbabilities(byValue.get(0), byValue.get(1), byValue.get(2));
}
var OPENAI_DECISIONS = {
  body: (parts, state, model) => JSON.stringify({
    model,
    input: stateText(state),
    questions: parts.map(({ key, question }) => ({
      type: "score",
      name: key,
      instructions: question.instructions,
      levels: question.criteria.map((description, index) => ({
        label: String(index),
        description
      }))
    }))
  }),
  read: replyReader(listAnswer, usageNamed("input_tokens", "output_tokens"))
};

// src/core/scoring/makers/openai.ts
var openai = {
  vendor: "openai",
  openrouterRoute: "decisions",
  openrouterNames: { "gpt-6-luna": "openai/gpt-6-luna-decisions" },
  paths: {
    direct: {
      url: "https://api.openai.com/v1/decisions",
      format: OPENAI_DECISIONS,
      model: "gpt-6-luna",
      keyHeader: BEARER
    },
    openrouter: {
      url: "https://openrouter.ai/api/alpha/decisions",
      format: OPENROUTER_DECISIONS,
      model: "openai/gpt-6-luna-decisions",
      keyHeader: BEARER
    }
  }
};

// src/core/scoring/formats/system-one.ts
var SYSTEM_ONE = {
  body: (parts, state, model) => JSON.stringify({ state, model, questions: questionMap(parts) }),
  read: replyReader(mapAnswer, usageNamed("input_tokens", "output_tokens"))
};

// src/core/scoring/makers/typesafe.ts
var JEV = "jev-latest";
var typesafe = {
  vendor: "typesafe",
  openrouterRoute: "system-one",
  openrouterNames: {
    "jev-latest": "jev-latest",
    "jev-preview": "jev-preview",
    "jev-1.14.0": "typesafe/jev-1.14",
    "jev-1.13.0": "typesafe/jev-1.13"
  },
  paths: {
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

// src/core/scoring/maker-registry.ts
var MODULES = {
  typesafe,
  openai,
  google
};
function modelOf(maker, path, stored) {
  const made = MODULES[maker];
  if (stored === void 0) return made.paths[path].model;
  if (path === "direct") return stored;
  if (Object.hasOwn(made.openrouterNames, stored))
    return made.openrouterNames[stored] ?? stored;
  return made.openrouterRoute === "system-one" ? stored : `${made.vendor}/${stored}`;
}
function endpointOf(attempt2) {
  if (!Object.hasOwn(MODULES, attempt2.maker)) return void 0;
  const { paths } = MODULES[attempt2.maker];
  if (!Object.hasOwn(paths, attempt2.path)) return void 0;
  return {
    ...paths[attempt2.path],
    model: modelOf(attempt2.maker, attempt2.path, attempt2.model)
  };
}

// src/utils/error.ts
var errorText = (err) => err instanceof Error ? err.message : String(err);

// src/core/options/models.ts
var QUOTED_KEY = /"(?:[^"\\]|\\.)*"(?=\s*:)/g;
var JSON_CHARS = /["{}]/;
var isPlainObject = (value) => {
  if (typeof value !== "object" || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};
var textOf = (value) => {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
};
var makerOf = (name) => MAKERS.find((maker) => maker === name);
function accept(named, provider, model) {
  const maker = makerOf(provider.trim());
  const name = model.trim();
  if (maker === void 0 || name === "" || name.includes("/") || Object.hasOwn(named, maker))
    return false;
  named[maker] = name;
  return true;
}
function readObject(object) {
  const named = {};
  for (const [provider, model] of Object.entries(object)) {
    if (typeof model !== "string") return { invalid: provider.trim() };
    if (!accept(named, provider, model))
      return { invalid: `${provider.trim()}:${model.trim()}` };
  }
  return { models: named };
}
function repeatedKey(text) {
  const seen = /* @__PURE__ */ new Set();
  for (const [token] of text.matchAll(QUOTED_KEY)) {
    const key = String(JSON.parse(token));
    if (seen.has(key)) return key;
    seen.add(key);
  }
  return void 0;
}
function parseJson2(text) {
  try {
    return JSON.parse(text);
  } catch {
    return void 0;
  }
}
function readOwnerForm(text) {
  if (text.startsWith("{") !== text.endsWith("}")) return { invalid: text };
  const inner = (text.startsWith("{") ? text.slice(1, -1) : text).trim();
  if (inner === "") return { models: {} };
  const named = {};
  for (const part of (inner.endsWith(",") ? inner.slice(0, -1) : inner).split(
    ","
  )) {
    const entry2 = part.trim();
    const colon = entry2.indexOf(":");
    if (colon < 0 || JSON_CHARS.test(entry2.slice(colon + 1)) || !accept(named, entry2.slice(0, colon), entry2.slice(colon + 1)))
      return { invalid: entry2 === "" ? text : entry2 };
  }
  return { models: named };
}
var isSilentModels = (stored) => stored === void 0 || stored === null || typeof stored === "string" && stored.trim() === "";
function readModels(stored) {
  if (isSilentModels(stored)) return { models: {} };
  if (isPlainObject(stored)) return readObject(stored);
  if (typeof stored !== "string") return { invalid: textOf(stored) };
  const text = stored.trim();
  if (text.startsWith("{")) {
    const parsed = parseJson2(text);
    if (isPlainObject(parsed)) {
      const read2 = readObject(parsed);
      if ("invalid" in read2) return read2;
      const repeated = repeatedKey(text);
      return repeated === void 0 ? read2 : { invalid: repeated };
    }
  }
  return readOwnerForm(text);
}
var formatModels = (names) => `{${MAKERS.flatMap((maker) => {
  const name = names[maker];
  return name === void 0 ? [] : [`${maker}:${name}`];
}).join(", ")}}`;
var sameNames = (a, b) => MAKERS.every((maker) => a[maker] === b[maker]);
function withModel(models, maker, name) {
  const read2 = readModels(models);
  if ("invalid" in read2 || read2.models[maker] !== void 0) return void 0;
  const text = typeof models === "string" ? models.trim() : void 0;
  const parsed = text?.startsWith("{") ? parseJson2(text) : void 0;
  let added;
  if (isPlainObject(models)) added = { ...models, [maker]: name };
  else if (isPlainObject(parsed))
    added = JSON.stringify({ ...parsed, [maker]: name });
  else added = formatModels({ ...read2.models, [maker]: name });
  const back = readModels(added);
  return "models" in back && sameNames(back.models, { ...read2.models, [maker]: name }) ? added : void 0;
}

// src/core/options/migrate.ts
var typesafeFromModel = (stored) => {
  const { model, models } = stored;
  const name = nonEmpty(model);
  if (name === void 0) return void 0;
  const added = withModel(models, "typesafe", name);
  if (added === void 0) return void 0;
  return {
    stored: { ...stored, models: added },
    change: "models: typesafe from the removed model option"
  };
};
var STEPS = [typesafeFromModel];
var SETTINGS_VERSION = STEPS.length;
function migrate(stored) {
  let current = stored;
  const changes = [];
  for (const step of STEPS) {
    const done = step(current);
    if (done === void 0) continue;
    current = done.stored;
    changes.push(done.change);
  }
  return { stored: current, changes };
}

// src/core/options/settings.ts
var VALUE_SETTINGS = ["provider", "gateway", "scope"];
var TOOL_NAME = "model_router_config";
var LABEL_SEPARATOR = " - ";
var TEXTS = {
  provider: {
    values: MAKERS,
    about: "whose model scores subagent calls",
    question: "Which provider's model should score subagent calls?",
    consequences: {
      typesafe: "Jev from TypeSafe, the model the plugin's questions are fitted to",
      openai: "OpenAI's decision model; costs more than Jev and its answers are not fitted",
      google: "Google's decision model; costs more than Jev and its answers are not fitted; on a free-tier key Google may use the text"
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
function settingsFrom(record) {
  const { provider, gateway, scope, models } = record;
  const maker = readProvider(provider);
  if (maker === void 0) return { skipped: notValid("provider") };
  const via = readGateway(gateway);
  if (via === void 0) return { skipped: notValid("gateway") };
  const routed = readScope(scope);
  if (routed === void 0) return { skipped: notValid("scope") };
  const read2 = readModels(models);
  if ("invalid" in read2) return { skipped: notValid("models") };
  return { provider: maker, gateway: via, scope: routed, models: read2.models };
}
var settingsOf = (stored) => settingsFrom(migrate(stored).stored);
function scopeOf(stored) {
  const { scope } = migrate(stored).stored;
  return readScope(scope) ?? DEFAULT_SCOPE;
}
var useOneOf = (setting) => `${setting}: use one of ${TEXTS[setting].values.join(", ")}`;
var unchanged = (setting, reason) => `${setting} unchanged: ${reason}`;
var unchangedBy = (setting, err) => unchanged(setting, errorText(err));
var alreadyValue = (value) => `already ${value}`;
var NO_ANSWER = "no answer from the dialog";
var NOT_OFFERED = "the answer was not one of the offered values";
var keyLine = (holder, state) => `${holder} key: ${state}`;
var label = (setting, value) => `${value}${LABEL_SEPARATOR}${TEXTS[setting].consequences[value]}`;
function ask(setting, current) {
  const { values, question } = TEXTS[setting];
  const first = valueFor(setting, current);
  const sorted = first === void 0 ? values : [first, ...values.filter((value) => value !== first)];
  return { question, options: sorted.map((value) => label(setting, value)) };
}
function pick(setting, answer) {
  return TEXTS[setting].values.find(
    (value) => label(setting, value) === answer
  );
}
async function chooseValue(setting, current, select, apply2) {
  const { question, options } = ask(setting, current);
  let answer;
  try {
    answer = await select(question, options);
  } catch {
    answer = void 0;
  }
  if (answer === void 0) return unchanged(setting, NO_ANSWER);
  const value = pick(setting, answer);
  return value === void 0 ? unchanged(setting, NOT_OFFERED) : apply2(value);
}
var valueLineFrom = (setting, record) => {
  const shown = record[setting];
  const value = valueFor(setting, shown);
  if (value === void 0)
    return `${setting}: ${String(shown)} (not valid: use one of ${TEXTS[setting].values.join(", ")})`;
  const settings = settingsFrom(record);
  if (setting === "gateway" && !("skipped" in settings))
    return `gateway: ${value} (${holders(settings).join(", then ")})`;
  return `${setting}: ${value}`;
};
var valueLine = (setting, stored) => valueLineFrom(setting, migrate(stored).stored);
var NOT_STORED = " (not stored yet: run setup)";
var modelsLinesFrom = (record, pending) => {
  const { models } = record;
  const shown = isSilentModels(models) ? "unset" : textOf(models);
  const read2 = readModels(models);
  if ("invalid" in read2)
    return [`models: ${shown} (not valid: ${read2.invalid})`];
  return [
    `models: ${shown}${pending ? NOT_STORED : ""}`,
    ...MAKERS.map(
      (maker) => `${maker} model: ${modelOf(maker, "direct", read2.models[maker])} (OpenRouter: ${modelOf(maker, "openrouter", read2.models[maker])})`
    )
  ];
};
var hasModel = (stored) => nonEmpty(stored.model) !== void 0;
var carryFrom = (stored, { stored: { models }, changes }) => ({
  ...changes.length > 0 ? { models: textOf(models) } : {},
  eraseModel: hasModel(stored)
});
var isPending = (carry) => carry.models !== void 0 || carry.eraseModel;
var modelsLines = (stored) => {
  const migrated = migrate(stored);
  return modelsLinesFrom(
    migrated.stored,
    isPending(carryFrom(stored, migrated))
  );
};
var settingsReport = (stored, extra, keys) => {
  const migrated = migrate(stored);
  const { stored: record } = migrated;
  const settings = settingsFrom(record);
  const keyLines = "skipped" in settings ? [] : holders(settings).map(
    (holder) => keyLine(holder, keys[holder] === void 0 ? "unset" : "set")
  );
  return [
    ...VALUE_SETTINGS.map((setting) => valueLineFrom(setting, record)),
    ...modelsLinesFrom(record, isPending(carryFrom(stored, migrated))),
    ...extra,
    ...keyLines
  ].join("\n");
};
var modelCarry = (stored) => carryFrom(stored, migrate(stored));
function modelsWrite(stored, text) {
  const read2 = readModels(text);
  if ("invalid" in read2)
    return { refused: unchanged("models", `not valid: ${read2.invalid}`) };
  return { models: modelCarry({ ...stored, models: text }).models ?? text };
}
var modelsCallOf = (setting, models) => typeof models === "string" && setting === void 0 ? { text: models } : { refused: BAD_MODELS_CALL };
var modelsAlready = (held, text) => held === text ? unchanged("models", alreadyValue(text)) : void 0;
var toolDescription = () => `Reads the router's settings. With no input it returns the provider, gateway, scope and models, and whether each key the settings allow is set. With a setting name (${VALUE_SETTINGS.join(", ")}) the plugin asks the person in its own dialog and writes their choice; never pass a value for these. With models and a string, the tool writes that string as the models setting at the person's request, for example {typesafe:jev-latest, openai:gpt-6-luna}. Never pass a key.`;
var TOOL_LABEL = "Model Router settings";
var BAD_MODELS_CALL = "Pass setting alone, or models as a text alone.";
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

// src/core/output/line.ts
var LINE_PREFIX = "model-router ";
var ENTRY_SEPARATOR = " | ";
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

// src/utils/serializer.ts
function serializer() {
  let tail = Promise.resolve();
  return (job) => {
    const run = tail.then(job);
    tail = run.catch(() => void 0);
    return run;
  };
}

// src/adapters/omp/settings.ts
import { readFile } from "node:fs/promises";
var gatewayOf = (text) => GATEWAYS.find((gateway) => gateway === text);
var namesNoValue = (setting, text) => valueFor(setting, text) === void 0;
function applied(global, effective) {
  const { provider: fromGlobal, gateway: gatewayFromGlobal, models } = global;
  const { provider, gateway, scope } = effective;
  return {
    provider: namesNoValue("provider", provider) ? provider : fromGlobal,
    gateway: gatewayText(gatewayFromGlobal, gateway),
    scope,
    models
  };
}
function gatewayText(global, effective) {
  if (namesNoValue("gateway", effective)) return effective;
  if (namesNoValue("gateway", global)) return global;
  const wider = gatewayOf(global);
  const narrowed = gatewayOf(effective);
  return wider && narrowed && narrowsGateway(narrowed, wider) ? effective : global;
}
async function readSettings(omp, cwd) {
  const plugin = omp.plugin ?? FALLBACK_NAME;
  try {
    const [global, effective] = await Promise.all([
      readGlobal(omp.getPluginsLockfile(), plugin),
      omp.getPluginSettings(plugin, cwd)
    ]);
    return applied(global, effective);
  } catch {
    return void 0;
  }
}
async function readGlobalSettings(omp) {
  const plugin = omp.plugin ?? FALLBACK_NAME;
  try {
    const { provider, gateway, scope, models } = await readGlobal(
      omp.getPluginsLockfile(),
      plugin
    );
    return { provider, gateway, scope, models };
  } catch {
    return void 0;
  }
}
async function readGlobal(path, plugin) {
  let text;
  try {
    text = await readFile(path, "utf8");
  } catch (err) {
    const { code } = isRecord(err) ? err : {};
    if (code === "ENOENT") return {};
    throw err;
  }
  const lock = JSON.parse(text);
  const { settings } = isRecord(lock) ? lock : {};
  const mine = isRecord(settings) ? settings[plugin] : void 0;
  return isRecord(mine) ? mine : {};
}
async function findAttempts(ctx, choice) {
  const keys = await collectKeys(choice, (holder) => findKey(ctx, holder));
  return plan(choice, keys);
}
async function findKey(ctx, holder) {
  try {
    const key = await ctx.modelRegistry.getApiKeyForProvider(holder);
    const trimmed = nonEmpty(key);
    if (trimmed !== void 0) return trimmed;
  } catch {
  }
  return nonEmpty(process.env[KEY_VARIABLES[holder]]);
}
function read(lookup2, id, settings, fallback) {
  try {
    return lookup2(id)?.get(settings);
  } catch {
    return fallback;
  }
}
var readTimeoutSetting = (lookup2, settings) => read(lookup2, "extensionHandlers.toolCallTimeoutMs", settings);
function readConfig(lookup2, settings) {
  const roles = read(lookup2, "modelRoles", settings);
  const overrides = read(lookup2, "task.agentModelOverrides", settings);
  const disabled = read(lookup2, "task.disabledAgents", settings);
  const maxEffort = read(lookup2, "task.maxEffort", settings, null);
  const effortEnabled = read(lookup2, "task.enableEffort", settings) === true;
  return isRecord(roles) && isRecord(overrides) && Array.isArray(disabled) ? { roles, overrides, disabled, maxEffort, effortEnabled } : void 0;
}

// src/adapters/omp/config.ts
var COMMAND_PREFIX = "model-router:";
var LINE_BREAK = "\n";
var projectOverrides = (setting) => `A project value for ${setting} overrides it.`;
function say(ctx, text) {
  try {
    if (ctx.hasUI) ctx.ui.notify(text);
    else process.stderr.write(`${text}
`);
  } catch {
  }
}
async function withSettings(omp, ctx, show) {
  const stored = await readSettings(omp, ctx.cwd);
  return stored === void 0 ? UNREADABLE : show(stored);
}
var readAll = (omp, ctx) => withSettings(
  omp,
  ctx,
  async (stored) => settingsReport(
    stored,
    [],
    await collectKeys(settingsOf(stored), (holder) => findKey(ctx, holder))
  )
);
async function apply(omp, ctx, setting, value) {
  if (!isValue(setting, value)) return useOneOf(setting);
  const { plugin } = omp;
  const before = await readSettings(omp, ctx.cwd);
  const global = await readGlobalSettings(omp);
  if (before === void 0 || global === void 0 || plugin === void 0)
    return unchanged(setting, UNREADABLE);
  if (global[setting] === value && before[setting] === value)
    return unchanged(setting, alreadyValue(value));
  const wrote = global[setting] !== value;
  if (wrote) {
    try {
      await omp.writeSetting(ctx.cwd, plugin, setting, value);
    } catch (err) {
      return unchangedBy(setting, err);
    }
  }
  const after = wrote ? await readSettings(omp, ctx.cwd) ?? { ...before, [setting]: value } : before;
  const line = valueLine(setting, after);
  return after[setting] === value ? line : [line, projectOverrides(setting)].join(LINE_BREAK);
}
async function applyModels(omp, ctx, text) {
  const { plugin } = omp;
  const global = await readGlobalSettings(omp);
  if (global === void 0 || plugin === void 0)
    return unchanged("models", UNREADABLE);
  const write = modelsWrite(global, text);
  if ("refused" in write) return write.refused;
  const already = modelsAlready(global.models, write.models);
  if (already !== void 0) return already;
  try {
    await omp.writeSetting(ctx.cwd, plugin, "models", write.models);
  } catch (err) {
    return unchanged("models", errorText(err));
  }
  const after = await readSettings(omp, ctx.cwd) ?? {
    ...global,
    models: write.models
  };
  return modelsLines(after).join(LINE_BREAK);
}
async function dialog(omp, ctx, setting) {
  if (!ctx.hasUI) return unchanged(setting, NO_ANSWER);
  const shown = await readSettings(omp, ctx.cwd);
  return chooseValue(
    setting,
    shown?.[setting],
    (question, options) => ctx.ui.select(question, options),
    (value) => apply(omp, ctx, setting, value)
  );
}
async function runTool(omp, ctx, params) {
  const { setting, models } = isRecord(params) ? params : {};
  if (models !== void 0) {
    const asked = modelsCallOf(setting, models);
    return "refused" in asked ? asked.refused : applyModels(omp, ctx, asked.text);
  }
  if (setting === void 0) return readAll(omp, ctx);
  return isValueSetting(setting) ? dialog(omp, ctx, setting) : badCall();
}
async function runCommand(omp, ctx, setting, args) {
  const value = args.trim();
  return value === "" ? withSettings(omp, ctx, (stored) => valueLine(setting, stored)) : apply(omp, ctx, setting, value);
}
var reply = (text) => ({
  content: [{ type: "text", text }]
});
function registerConfig(omp, pi) {
  const serial = serializer();
  for (const setting of VALUE_SETTINGS)
    pi.registerCommand(`${COMMAND_PREFIX}${setting}`, {
      description: COMMAND_DESCRIPTIONS[setting],
      handler: (args, ctx) => serial(async () => say(ctx, await runCommand(omp, ctx, setting, args)))
    });
  pi.registerTool({
    name: TOOL_NAME,
    label: TOOL_LABEL,
    description: toolDescription(),
    parameters: pi.zod.object({
      setting: pi.zod.enum(VALUE_SETTINGS).optional(),
      models: pi.zod.string().optional()
    }),
    loadMode: "essential",
    approval: "write",
    execute: (_id, params, _signal, _update, ctx) => serial(async () => reply(await runTool(omp, ctx, params)))
  });
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

// src/core/scoring/handler-deadline.ts
var HANDLER_MARGIN_MS = 2e3;
var MIN_DEADLINE_MS = 1e3;
var MIN_TIMEOUT_MS = MIN_DEADLINE_MS + HANDLER_MARGIN_MS;
var deadlineFor = (timeout) => Math.min(ROUTING_LIMIT_MS, timeout - HANDLER_MARGIN_MS);

// src/adapters/omp/deadline.ts
var DEFAULT_TIMEOUT_MS = 3e4;
function budgetFor(value) {
  const timeout = isPositiveNumber(value) ? value : DEFAULT_TIMEOUT_MS;
  const deadline = deadlineFor(timeout);
  if (deadline >= MIN_DEADLINE_MS) return { deadline };
  return {
    closed: `tool call timeout ${timeout} ms leaves ${Math.max(0, deadline)} ms to route`
  };
}

// src/adapters/omp/items.ts
var TASK = "task";
var BUNDLED = "bundled";
var ROLE_MARK = "@";
var SEANCE = "seance";
var CUSTOM_AGENT = "custom task agent";
var inScope = (name, scope) => scope === "extended" || name === TASK;
var findAgent = (name, { agents }) => agents?.find((agent) => agent.name === name);
var ownRole = (agent) => agent?.model?.find((model) => model.startsWith(ROLE_MARK))?.slice(ROLE_MARK.length);
function userChoice(name, facts) {
  if (name === TASK && isSet(facts.roles[TASK])) return "task model role set";
  if (Object.hasOwn(facts.overrides, name) && isSet(facts.overrides[name]))
    return `${name} model override set`;
  if (facts.disabled.includes(name)) return `${name} agent disabled`;
  return void 0;
}
function agentGate(name, facts) {
  const found = findAgent(name, facts);
  if (found?.source === BUNDLED) return void 0;
  if (facts.scope === "core") return CUSTOM_AGENT;
  if (facts.agents === void 0) return agentDiscoveryFailed(name);
  if (found === void 0) return agentUnknown(name);
  return found.model?.length ? setsOwnModel(name) : void 0;
}
var seanceGate = (name) => name === SEANCE ? `${name} spawns without the hook omp gives plugins, so its model cannot change` : void 0;
var modelGate = (model) => model === void 0 ? void 0 : setsOwnModel("the item");
function itemCheck(name, facts, model) {
  if (!inScope(name, facts.scope)) return outsideCoreScope(name);
  return userChoice(name, facts) ?? seanceGate(name) ?? modelGate(model) ?? agentGate(name, facts);
}
function spawnCheck({ agent, modelRole }, facts) {
  const reason = itemCheck(agent, facts);
  if (reason !== void 0) return reason;
  return modelRole && modelRole !== ownRole(findAgent(agent, facts)) ? `${agent} spawns with another model role` : void 0;
}
function roleOf(name, facts) {
  const found = findAgent(name, facts);
  return name === TASK && found?.source === BUNDLED ? DEFAULT_ROLE : roleText(found?.description);
}

// src/adapters/omp/effort.ts
var NO_PATTERNS = "no model patterns";
var SELECTORS = [
  "inherit",
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max"
];
var AUTO = "auto";
var MIN_PREFIX = 2;
var CEILINGS = ["minimal", "low", "medium", "high", "xhigh", "max"];
var LOWEST = CEILINGS.indexOf("low");
function carriesLevel(pattern) {
  const colon = pattern.lastIndexOf(":");
  if (colon < 0) return false;
  const suffix = pattern.slice(colon + 1);
  if (suffix === AUTO || SELECTORS.includes(suffix))
    return true;
  return suffix.length >= MIN_PREFIX && SELECTORS.filter((selector) => selector.startsWith(suffix)).length === 1;
}
var patternsOf = (value) => (typeof value === "string" ? [value] : Array.isArray(value) ? value : []).filter((v) => typeof v === "string").flatMap((v) => v.split(",")).map((v) => v.trim()).filter((v) => v !== "");
function roleCarriesLevel(role, roles, seen = /* @__PURE__ */ new Set()) {
  if (seen.has(role) || !Object.hasOwn(roles, role)) return false;
  seen.add(role);
  return patternsOf(roles[role]).some(
    (pattern) => carriesLevel(pattern) || pattern.startsWith(ROLE_MARK) && roleCarriesLevel(pattern.slice(ROLE_MARK.length), roles, seen)
  );
}
function capped(effort, ceiling) {
  if (ceiling === void 0) return effort;
  const top = CEILINGS.indexOf(ceiling);
  if (top < LOWEST) return void 0;
  return CEILINGS.indexOf(effort) <= top ? effort : CEILINGS[top];
}
function planEffort({ ladder, itemEffort }, model, { roles, maxEffort, effortEnabled }, patterns) {
  if (itemEffort && effortEnabled) return { kept: CALLER_EFFORT };
  if (model !== void 0 && roleCarriesLevel(model.slice(ROLE_MARK.length), roles))
    return { kept: CONFIG_EFFORT };
  if (model === void 0 && patterns?.some(carriesLevel))
    return { kept: CONFIG_EFFORT };
  const effort = capped(ladder, maxEffort);
  if (effort === void 0) return { kept: CONFIG_EFFORT };
  if (model === void 0 && patterns?.length === 0)
    return { kept: NO_PATTERNS };
  return { set: effort };
}
var lineFor = (routed, target, plan2) => routedLine({
  level: routed.level,
  target,
  effort: "set" in plan2 ? plan2.set : plan2.kept,
  probabilities: routed.probabilities,
  suffix: routed.suffix
});
function modelFor(model, plan2, patterns) {
  if (model !== void 0)
    return "set" in plan2 ? `${model}:${plan2.set}` : model;
  return "set" in plan2 ? patterns.map((p) => `${p}:${plan2.set}`) : void 0;
}

// src/adapters/omp/gates.ts
var ROLE_NAMES = { small: "smol", middle: "midl", large: "slow" };
async function checkGates(omp, pi, ctx, spawning = { agent: TASK }) {
  const batch = await openBatch(omp, pi, ctx, await readSettings(omp, ctx.cwd));
  if ("closed" in batch) return batch;
  const reason = spawnCheck(spawning, batch.facts);
  return reason === void 0 ? batch : { closed: reason };
}
async function openBatch(omp, pi, ctx, stored) {
  if (stored === void 0) return { closed: UNREADABLE };
  const settings = settingsOf(stored);
  if ("skipped" in settings) return { closed: settings.skipped };
  const attempts = await findAttempts(ctx, settings);
  if (attempts.length === 0) return { closed: KEY_UNSET };
  const config = readConfig(omp.lookup, pi.pi.settings);
  if (config === void 0) return { closed: UNREADABLE };
  const agents = await discover(pi, ctx);
  const models = slotRecord((slot) => slotModel(ctx, slot));
  return {
    attempts,
    facts: { ...config, scope: settings.scope, agents, models }
  };
}
function slotModel(ctx, slot) {
  const role = ROLE_MARK + ROLE_NAMES[slot];
  return slotState(resolves(ctx, role) ? role : void 0);
}
function resolves(ctx, role) {
  try {
    return ctx.models.resolve(role) !== void 0;
  } catch {
    return false;
  }
}
async function discover(pi, ctx) {
  try {
    return (await pi.pi.discoverAgents(ctx.cwd)).agents;
  } catch {
    return void 0;
  }
}

// src/core/parts/tier.ts
var TIER_DOWN = 2 ** 0.25;
var TIER_UP = 2 ** 0.5;
var TIER_INSTRUCTIONS = "How much judgment does completing `task` require from an agent whose role is `role`? `description` is the caller's one-line summary of the task.";
var TIER_TEXTS = [
  "Lookup or transcription: the brief names the exact files to read or string to find, or holds the exact code, config or prose to write. It gives the commands to run and the check that proves the work done. No choice is left.",
  "Bounded judgment: the brief fixes the goal, and whatever it leaves open is routine. Check work against stated requirements, fix named defects, implement from a given plan or spec, or answer a question from a few named files.",
  "Open judgment: the part the brief leaves open is hard to get right, or a wrong choice there would be easy to miss. Make a design decision that other work depends on, find a cause the symptom does not show, solve a problem with no standard method, or judge risks and flaws that are easy to miss."
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
    const reply2 = await Promise.race([
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
      text = await Promise.race([reply2.text(), stopped]);
    } catch (error) {
      if (isSuccess(reply2.status) || caller.aborted) throw error;
      return {
        outcome: { status: reply2.status, text: "" },
        headers: reply2.headers
      };
    }
    return { outcome: { status: reply2.status, text }, headers: reply2.headers };
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
var VERSION = true ? "0.25.2" : "dev";
var USER_AGENT = `model-router/${VERSION} (+https://github.com/Akurganow/model-router)`;
async function askOnce(input, attempt2) {
  const { parts, state, fetchFn, clock, signal } = input;
  const endpoint = endpointOf(attempt2);
  if (!endpoint) return UNKNOWN;
  const { url, format, model, keyHeader } = endpoint;
  const body = format.body(parts, state, model);
  const received = await send(
    fetchFn,
    url,
    {
      headers: {
        [keyHeader.name]: `${keyHeader.prefix}${attempt2.key}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT
      },
      body
    },
    {
      signal,
      clock,
      ...attempt2.timeout !== void 0 && { timeout: attempt2.timeout },
      ...attempt2.retries !== void 0 && { retries: attempt2.retries }
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
async function ask2(input, attempt2) {
  try {
    return await askOnce(input, attempt2);
  } catch {
    return UNKNOWN;
  }
}

// src/core/scoring/route.ts
async function route(input) {
  const { attempts, signal } = input;
  if (attempts.length === 0) return { skipped: KEY_UNSET };
  const failed = [];
  for (const [i, attempt2] of attempts.entries()) {
    const result = await ask2(input, attempt2);
    if (isFailure(result)) {
      failed.push({
        holder: attempt2.holder,
        reason: skipText(result, abortCategory(signal))
      });
      if (!fallsBack(result)) break;
      if (i < attempts.length - 1) input.onFallback?.(attempt2.holder);
      continue;
    }
    const decision = toDecision(result, attempt2.holder);
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

// src/utils/clock.ts
var realClock = {
  after: (ms, fn) => {
    const timer = setTimeout(fn, ms);
    return { cancel: () => clearTimeout(timer) };
  }
};

// src/adapters/omp/score.ts
var MAX_PARALLEL = 4;
async function scoreItems(items, context, { attempts, facts }, deadline) {
  const limit = limitSignal(deadline, realClock);
  const passedOver = /* @__PURE__ */ new Set();
  try {
    return await mapLimit(items, MAX_PARALLEL, async (pending) => {
      const { item, agent } = pending;
      const reason = itemCheck(agent, facts, item.model);
      if (reason !== void 0) return { ...pending, stored: skipped(reason) };
      const routing = {
        attempts: attempts.filter((a) => !passedOver.has(a.holder)),
        onFallback: (holder) => void passedOver.add(holder)
      };
      const decided = await scoreItem(
        item,
        context,
        roleOf(agent, facts),
        routing,
        limit.signal
      );
      return { ...pending, stored: toStored(decided, item, facts) };
    });
  } finally {
    limit.disarm();
  }
}
function scoreItem(item, context, role, routing, signal) {
  return scoreWork({
    state: routingState({
      role,
      description: item.name,
      task: item.task,
      context
    }),
    ...routing,
    fetchFn: fetch,
    clock: realClock,
    signal
  });
}
var skipped = (reason) => ({ line: skippedLine(reason) });
function toStored(decided, item, facts) {
  if ("skipped" in decided) return skipped(decided.skipped);
  const routed = {
    level: decided.tier,
    ladder: effortFor(decided.tier, decided.work),
    itemEffort: item.effort !== void 0,
    probabilities: decided.probabilities,
    suffix: decided.suffix
  };
  const picked = pickModel(
    decided.tier,
    facts.models[slotForLevel(decided.tier)]
  );
  const plan2 = planEffort(routed, picked.model, facts);
  return { line: lineFor(routed, picked.target, plan2), routed };
}
async function mapLimit(items, limit, fn) {
  const results = [];
  const queue = items.entries();
  const worker = async () => {
    for (const [i, item] of queue) results[i] = await fn(item);
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker)
  );
  return results;
}

// src/adapters/omp/store.ts
var STORE_MAX = 64;
function link({ byKey }, entry2, key) {
  entry2.keys.add(key);
  byKey.set(key, (byKey.get(key) ?? /* @__PURE__ */ new Set()).add(entry2));
}
function unlink({ byKey }, entry2) {
  for (const key of entry2.keys) {
    const holders2 = byKey.get(key);
    holders2?.delete(entry2);
    if (holders2?.size === 0) byKey.delete(key);
  }
  entry2.keys.clear();
}
function markLearned({ awaitingId }, entry2) {
  const mine = awaitingId.get(entry2.call);
  mine?.delete(entry2);
  if (mine?.size === 0) awaitingId.delete(entry2.call);
}
function remove(c, entry2) {
  unlink(c, entry2);
  markLearned(c, entry2);
  c.entries.delete(entry2);
}
function createStore() {
  const c = {
    entries: /* @__PURE__ */ new Set(),
    byKey: /* @__PURE__ */ new Map(),
    awaitingId: /* @__PURE__ */ new Map()
  };
  return {
    // The index is the item's position in the call's task list, which progress reports as `index`.
    add(call, index, name, agent, stored) {
      const oldest = c.entries.values().next();
      if (c.entries.size >= STORE_MAX && !oldest.done) remove(c, oldest.value);
      const entry2 = { stored, agent, call, index, keys: /* @__PURE__ */ new Set() };
      c.entries.add(entry2);
      c.awaitingId.set(call, (c.awaitingId.get(call) ?? /* @__PURE__ */ new Set()).add(entry2));
      link(c, entry2, `${call}:${index}`);
      if (typeof name === "string" && nonEmpty(name) !== void 0)
        link(c, entry2, name);
    },
    // Progress names each running child. Its id is the spawn key in async mode, so it replaces the guesses.
    learn(call, progress) {
      if (!Array.isArray(progress)) return;
      for (const item of progress) {
        const { index, id } = isRecord(item) ? item : {};
        if (typeof id !== "string" || id === "") continue;
        const entry2 = [...c.awaitingId.get(call) ?? []].find(
          (e) => e.index === index
        );
        if (!entry2) continue;
        unlink(c, entry2);
        markLearned(c, entry2);
        link(c, entry2, id);
      }
    },
    // The ids stay: an async call ends before its children spawn.
    end(call) {
      for (const entry2 of [...c.awaitingId.get(call) ?? []]) remove(c, entry2);
    },
    // More than one match is ambiguous, and an ambiguous key takes nothing.
    // A decision binds to its agent: another agent takes nothing and leaves it stored.
    take(key, agent) {
      const holders2 = key === void 0 ? void 0 : c.byKey.get(key);
      const [entry2] = holders2?.size === 1 ? holders2 : [];
      if (entry2?.agent !== agent) return void 0;
      remove(c, entry2);
      return { stored: entry2.stored, index: entry2.index };
    }
  };
}

// src/adapters/omp/router.ts
function isEligible(item) {
  if (!isRecord(item)) return false;
  const { agent, task } = item;
  return (agent === void 0 || typeof agent === "string") && typeof task === "string" && task !== "";
}
async function attempt(fn) {
  try {
    return await fn();
  } catch {
    return void 0;
  }
}
function report(ctx, entries) {
  say(ctx, LINE_PREFIX + entries.join(ENTRY_SEPARATOR));
}
var entry = (index, line) => `task ${index + 1}: ${line}`;
var eligibleItems = (tasks) => tasks.flatMap(
  (item, index) => isEligible(item) ? [{ index, item, agent: item.agent ?? TASK }] : []
);
function createRouter(omp, pi) {
  const store = createStore();
  async function onToolCall(event, ctx) {
    const started = Date.now();
    const { input } = event;
    if (event.toolName !== TASK || !isRecord(input)) return;
    const { tasks, context } = input;
    if (!Array.isArray(tasks)) return;
    const eligible = eligibleItems(tasks);
    if (eligible.length === 0) return;
    const stored = await readSettings(omp, ctx.cwd);
    const scope = stored === void 0 ? DEFAULT_SCOPE : scopeOf(stored);
    const items = eligible.filter(({ agent }) => inScope(agent, scope));
    if (items.length === 0) return;
    const skipAll = (reason) => report(
      ctx,
      items.map(({ index }) => entry(index, skippedLine(reason)))
    );
    const budget = budgetFor(readTimeoutSetting(omp.lookup, pi.pi.settings));
    if ("closed" in budget) return skipAll(budget.closed);
    const gates = await openBatch(omp, pi, ctx, stored);
    if ("closed" in gates) return skipAll(gates.closed);
    const scored = await scoreItems(
      items,
      contextText(context),
      gates,
      budget.deadline - (Date.now() - started)
    );
    for (const { index, item, agent, stored: stored2 } of scored)
      store.add(event.toolCallId, index, item.name, agent, stored2);
    report(
      ctx,
      scored.map(({ index, stored: stored2 }) => entry(index, stored2.line))
    );
  }
  async function onSpawn(event, ctx) {
    if (event.invocationKind !== TASK) return;
    const taken = store.take(event.spawnKey, event.agent);
    const routed = taken?.stored.routed;
    if (!taken || !routed) return;
    const gates = await checkGates(omp, pi, ctx, event);
    if ("closed" in gates)
      return void report(ctx, [entry(taken.index, skippedLine(gates.closed))]);
    const patterns = event.patterns ?? [];
    const picked = pickModel(
      routed.level,
      gates.facts.models[slotForLevel(routed.level)]
    );
    const plan2 = planEffort(routed, picked.model, gates.facts, patterns);
    const line = lineFor(routed, picked.target, plan2);
    if (line !== taken.stored.line) report(ctx, [entry(taken.index, line)]);
    const model = modelFor(picked.model, plan2, patterns);
    return model === void 0 ? void 0 : { model, note: LINE_PREFIX + line };
  }
  function learn({ toolName, toolCallId }, result) {
    if (toolName !== TASK) return;
    const { details } = isRecord(result) ? result : {};
    const { progress } = isRecord(details) ? details : {};
    store.learn(toolCallId, progress);
  }
  function onToolEnd(event) {
    learn(event, event.result);
    if (event.toolName === TASK) store.end(event.toolCallId);
  }
  return { onToolCall, onSpawn, learn, onToolEnd };
}
function createExtension(omp) {
  return (pi) => {
    const router = createRouter(omp, pi);
    registerConfig(omp, pi);
    pi.on("tool_call", async (event, ctx) => {
      await attempt(() => router.onToolCall(event, ctx));
      return void 0;
    });
    pi.on("tool_execution_update", async (event) => {
      await attempt(async () => router.learn(event, event.partialResult));
    });
    pi.on("tool_execution_end", async (event) => {
      await attempt(async () => router.onToolEnd(event));
    });
    pi.on(
      "before_subagent_spawn",
      (event, ctx) => attempt(() => router.onSpawn(event, ctx))
    );
  };
}

// src/adapters/omp/index.ts
async function writeSetting(cwd, plugin, key, value) {
  const { PluginManager } = await import("@oh-my-pi/pi-coding-agent/extensibility/plugins/manager");
  await new PluginManager(cwd).setPluginSetting(plugin, key, value);
}
var index_default = createExtension({
  plugin: readInstalledName(import.meta.url),
  lookup,
  getPluginsLockfile,
  getPluginSettings,
  writeSetting
});
export {
  index_default as default
};
