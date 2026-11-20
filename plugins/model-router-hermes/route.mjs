// src/core/output/reasons.ts
var CALLER_EFFORT = "caller effort";
var CONFIG_EFFORT = "config effort";
var KEY_UNSET = "key unset";
var BAD_REPLY = "bad reply";
var TIMEOUT = "timeout";
var FAILED = "failed";
var NETWORK_ERROR = "network error";
var httpStatus = (status) => `HTTP ${status}`;
var CANCELLED = "cancelled";
var failedAttemptText = (f) => `${f.provider} ${f.reason}`;

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
  provider,
  model,
  inputTokens,
  outputTokens,
  failed
}) {
  return ` \xB7 ${provider}` + (model ? ` ${model}` : "") + (isCount(inputTokens) && isCount(outputTokens) ? ` \xB7 ${inputTokens}/${outputTokens} tok` : "") + (failed ? ` \xB7 ${failedAttemptText(failed)}` : "");
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

// src/utils/guards.ts
var isRecord = (v) => typeof v === "object" && v !== null;
var isPositiveNumber = (v) => typeof v === "number" && Number.isFinite(v) && v > 0;

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
      return FALLBACK_STATUSES.has(failure.status) || failure.status >= SERVER_ERRORS.min && failure.status <= SERVER_ERRORS.max;
    case "aborted":
    case "malformed":
    case "unknown":
      return false;
  }
}

// src/core/scoring/formats/system-one.ts
var isProbability = (p) => typeof p === "number" && p >= 0 && p <= 1;
function parseProbabilities(answers, key) {
  const a = isRecord(answers) ? answers[key] : void 0;
  if (!isRecord(a)) return void 0;
  const { type, probabilities } = a;
  if (type !== "score" || !isRecord(probabilities)) return void 0;
  if (Object.keys(probabilities).length !== LEVELS.length) return void 0;
  const { 0: p0, 1: p1, 2: p2 } = probabilities;
  if (!isProbability(p0) || !isProbability(p1) || !isProbability(p2))
    return void 0;
  return { 0: p0, 1: p1, 2: p2 };
}
function parse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return void 0;
  }
}
var count = (v) => typeof v === "number" ? v : null;
function usageOf(usage) {
  if (!isRecord(usage)) return void 0;
  const { input_tokens, output_tokens } = usage;
  return {
    input_tokens: count(input_tokens),
    output_tokens: count(output_tokens)
  };
}
function read(parts, text) {
  const reply = parse(text);
  const { answers, model, usage } = isRecord(reply) ? reply : {};
  const pairs = [];
  for (const part of parts) {
    const probabilities = parseProbabilities(answers, part.key);
    if (!probabilities) return MALFORMED;
    pairs.push([part, probabilities]);
  }
  return { answers: pairs, model, usage: usageOf(usage) };
}
var SYSTEM_ONE = {
  body: (parts, state, model) => JSON.stringify({
    state,
    model,
    questions: Object.fromEntries(parts.map((p) => [p.key, p.question]))
  }),
  read
};

// src/core/scoring/endpoints.ts
var ENDPOINTS = {
  typesafe: {
    url: "https://api.typesafe.ai/v1/systemone",
    format: SYSTEM_ONE
  },
  openrouter: {
    url: "https://openrouter.ai/api/v1/systemone",
    format: SYSTEM_ONE
  }
};
var endpointOf = (attempt) => Object.hasOwn(ENDPOINTS, attempt.provider) ? ENDPOINTS[attempt.provider] : void 0;

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
var SERVER_ERRORS2 = { min: 500, max: 599 };
function isRetried(outcome) {
  if (!isFailure(outcome))
    return outcome.status === 408 || outcome.status === 429 || outcome.status >= SERVER_ERRORS2.min && outcome.status <= SERVER_ERRORS2.max;
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
  const rawMs = headers.get("retry-after-ms");
  const ms = rawMs === null ? Number.NaN : Number(rawMs);
  if (Number.isFinite(ms) && ms >= 0) return ms;
  const raw = headers.get("retry-after");
  if (raw === null) return void 0;
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) {
    return seconds >= 0 ? seconds * 1e3 : void 0;
  }
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
  if (caller.aborted) return Promise.resolve(false);
  return new Promise((resolve2) => {
    const done = (waited) => {
      timer.cancel();
      caller.removeEventListener("abort", onAbort);
      resolve2(waited);
    };
    const onAbort = () => done(false);
    const timer = clock.after(ms, () => done(true));
    caller.addEventListener("abort", onAbort, { once: true });
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
    if (!await pause(retryDelayMs(retry, headers), signal, clock))
      return ABORTED;
  }
}

// src/core/scoring/ask.ts
var VERSION = true ? "0.24.0" : "dev";
var USER_AGENT = `model-router/${VERSION} (+https://github.com/Akurganow/model-router)`;
async function askOnce(input, attempt) {
  const { parts, state, fetchFn, clock, signal } = input;
  const endpoint = endpointOf(attempt);
  if (!endpoint) return UNKNOWN;
  const { url, format } = endpoint;
  const body = format.body(parts, state, attempt.model);
  const received = await send(
    fetchFn,
    url,
    {
      headers: {
        Authorization: `Bearer ${attempt.key}`,
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
async function ask(input, attempt) {
  try {
    return await askOnce(input, attempt);
  } catch {
    return UNKNOWN;
  }
}

// src/core/scoring/limit.ts
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
  const onParentAbort = () => controller.abort(parent?.reason);
  parent?.addEventListener("abort", onParentAbort, { once: true });
  try {
    const timer = clock.after(ms, () => controller.abort(LIMIT_REACHED));
    return {
      signal,
      disarm: () => {
        parent?.removeEventListener("abort", onParentAbort);
        timer.cancel();
      }
    };
  } catch (error) {
    parent?.removeEventListener("abort", onParentAbort);
    throw error;
  }
}
async function raceDeadline(work2, deadlineMs, clock, hostSignal) {
  try {
    const { signal, disarm } = limitSignal(deadlineMs, clock, hostSignal);
    try {
      return await new Promise((settle) => {
        const onAbort = () => settle(void 0);
        signal.addEventListener("abort", onAbort, { once: true });
        if (signal.aborted) onAbort();
        work2(signal).then(
          (result) => signal.aborted ? void 0 : result,
          () => void 0
        ).then(settle);
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

// src/core/scoring/route.ts
async function route(input) {
  const { attempts, signal } = input;
  if (attempts.length === 0) return { skipped: KEY_UNSET };
  const failed = [];
  for (const [i, attempt] of attempts.entries()) {
    const result = await ask(input, attempt);
    if (isFailure(result)) {
      failed.push({
        provider: attempt.provider,
        reason: skipText(result, abortCategory(signal))
      });
      if (!fallsBack(result)) break;
      if (i < attempts.length - 1) input.onFallback?.(attempt.provider);
      continue;
    }
    const decision = toDecision(result, attempt.provider);
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
function toDecision({ answers, model, usage }, provider) {
  const parts = {};
  for (const [part, probabilities] of answers)
    parts[part.key] = { level: part.pick(probabilities), probabilities };
  return { parts, provider, model, usage };
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
      provider: decision.provider,
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
var slotRecord = (make) => Object.fromEntries(SLOTS.map((slot) => [slot, make(slot)]));
var slotState = (model) => model === void 0 ? { state: "unset" } : { state: "set", model };
function pickModel(level, state) {
  const slot = slotForLevel(level);
  return state.state === "set" ? { slot, model: state.model, target: state.model } : { slot, model: void 0, target: `${slot} model unset` };
}

// src/core/providers/provider.ts
var PROVIDERS = ["typesafe", "openrouter"];
var FIRST_ATTEMPT_TIMEOUT_MS = 2e3;
var MODELS = {
  typesafe: "jev-latest",
  openrouter: "jev-latest"
};
var DEFAULT_VALUE = "typesafe";
var ORDER = {
  auto: PROVIDERS,
  "openrouter-first": ["openrouter", "typesafe"],
  typesafe: ["typesafe"],
  openrouter: ["openrouter"]
};
var parseProvider = (value) => typeof value === "string" && Object.hasOwn(ORDER, value) ? value : void 0;
var resolve = (value) => parseProvider(value) ?? DEFAULT_VALUE;
var order = (value) => ORDER[resolve(value)];
function plan(value, keys) {
  const attempts = [];
  for (const provider of order(value)) {
    const key = keys[provider];
    if (key) attempts.push({ provider, model: MODELS[provider], key });
  }
  return attempts.map(
    (attempt, i) => i < attempts.length - 1 ? { ...attempt, timeout: FIRST_ATTEMPT_TIMEOUT_MS, retries: 0 } : attempt
  );
}

// src/adapters/hermes/request.ts
var KEPT_EFFORTS = ["config", "caller"];
var readKeys = (value) => Object.fromEntries(
  PROVIDERS.flatMap((provider) => {
    const key = isRecord(value) ? nonEmpty(value[provider]) : void 0;
    return key === void 0 ? [] : [[provider, key]];
  })
);
var readModels = (value) => slotRecord((slot) => isRecord(value) ? nonEmpty(value[slot]) : void 0);
var readBudget = (value) => isPositiveNumber(value) ? value : void 0;
function readRequest(raw) {
  if (!isRecord(raw) || Array.isArray(raw)) return void 0;
  const {
    task,
    context,
    provider,
    keys,
    budgetMs,
    models,
    keptEffort,
    description
  } = raw;
  return {
    task: typeof task === "string" ? task : "",
    context: contextText(context),
    provider,
    keys: readKeys(keys),
    budgetMs: readBudget(budgetMs),
    models: readModels(models),
    keptEffort: KEPT_EFFORTS.find((source) => source === keptEffort),
    description: typeof description === "string" ? description : ""
  };
}

// src/adapters/hermes/route.ts
var skippedBy = (reason) => ({ skipped: reason });
var skip2 = (reason) => ({
  outcome: "skip",
  line: `${LINE_PREFIX}${skippedLine(reason)}`
});
var KEPT_LABELS = {
  config: CONFIG_EFFORT,
  caller: CALLER_EFFORT
};
async function score(request, { fetchFn }, signal) {
  return scoreWork({
    state: routingState({
      role: DEFAULT_ROLE,
      description: request.description,
      task: request.task,
      context: request.context
    }),
    attempts: plan(request.provider, request.keys),
    fetchFn,
    clock: realClock,
    signal
  });
}
async function scored(request, deps, signal) {
  try {
    return await score(request, deps, signal);
  } catch {
    return skippedBy(FAILED);
  }
}
function answer(request, decided) {
  const level = decided.tier;
  const slot = slotForLevel(level);
  const model = request.models[slot];
  const effort = effortFor(level, decided.work);
  const kept = request.keptEffort === void 0 ? void 0 : KEPT_LABELS[request.keptEffort];
  return {
    outcome: "route",
    slot,
    effort: kept === void 0 ? effort : null,
    line: LINE_PREFIX + routedLine({
      level,
      target: pickModel(level, slotState(model)).target,
      effort: kept ?? effort,
      probabilities: decided.probabilities,
      suffix: decided.suffix
    })
  };
}
async function routeRequest(raw, deps) {
  try {
    const request = readRequest(raw);
    if (request === void 0) return skip2(FAILED);
    if (request.budgetMs === void 0) return skip2(FAILED);
    const decided = await raceDeadline(
      (signal) => scored(request, deps, signal),
      request.budgetMs,
      deps.clock,
      void 0
    );
    if (decided === void 0) return skip2(TIMEOUT);
    return "skipped" in decided ? skip2(decided.skipped) : answer(request, decided);
  } catch {
    return skip2(FAILED);
  }
}

// src/adapters/hermes/index.ts
async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}
async function main() {
  try {
    const raw = JSON.parse(await readStdin());
    const response = await routeRequest(raw, {
      fetchFn: fetch,
      clock: realClock
    });
    return JSON.stringify(response);
  } catch {
    return JSON.stringify(skip2(FAILED));
  }
}
process.stdout.write(`${await main()}
`, () => process.exit(0));
