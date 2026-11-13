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

// src/core/brief.ts
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
    pattern: /\b([A-Za-z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD))(["']?\s*[=:]\s*)(?:"[^"\n]*"?|'[^'\n]*'?|[^\s"']+)/gi,
    replacement: "$1$2***"
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
    const count = close - line;
    out += `${text.slice(kept, open.index)}[an exact block of ${count} ${count === 1 ? "line" : "lines"} is given verbatim]`;
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

// src/core/line.ts
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

// src/core/slots.ts
var SLOTS = ["small", "middle", "large"];
var slotForLevel = (level) => SLOTS[level];
var slotSetting = (slot) => `${slot}_model`;
var SLOT_SETTINGS = SLOTS.map(slotSetting);
var slotRecord = (make) => Object.fromEntries(SLOTS.map((slot) => [slot, make(slot)]));
var slotState = (model, resolved) => {
  if (model === void 0) return { state: "unset" };
  return resolved ? { state: "set", model } : { state: "unresolved" };
};
function pickModel(level, state) {
  const slot = slotForLevel(level);
  return state.state === "set" ? { slot, model: state.model, target: state.model } : { slot, model: void 0, target: `${slot} model ${state.state}` };
}
var slotLine = (name, shown) => `${name}: ${shown ?? "unset"}`;

// src/utils/error.ts
var errorText = (err) => err instanceof Error ? err.message : String(err);

// node_modules/@typesafe-ai/sdk/dist/index.mjs
var requestIdFrom = (headers) => headers.get("x-typesafe-request-id") ?? void 0;
var APIPromise = class APIPromise2 extends Promise {
  #responsePromise;
  #parseResponse;
  #parsed;
  constructor(responsePromise, parseResponse) {
    super((resolve2) => resolve2(void 0));
    this.#responsePromise = responsePromise;
    this.#parseResponse = parseResponse;
  }
  /**
  * Resolves to the raw `Response` without parsing the body. SDK requests buffer the full
  * body under the request timeout before handoff; reading it afterwards is caller-owned.
  * The caller owns the body; don't also `await` the parsed result on the same promise.
  */
  asResponse() {
    return this.#responsePromise;
  }
  /** Return the parsed result, HTTP response, and request ID. */
  async withResponse() {
    const [data, response] = await Promise.all([this.#parse(), this.#responsePromise]);
    return {
      data,
      response,
      requestId: requestIdFrom(response.headers)
    };
  }
  /** Transform the parsed result, sharing the HTTP response and a single body parse. */
  map(fn) {
    return new APIPromise2(this.#responsePromise, () => this.#parse().then(fn));
  }
  #parse() {
    this.#parsed ??= this.#responsePromise.then(this.#parseResponse);
    return this.#parsed;
  }
  then(onfulfilled, onrejected) {
    return this.#parse().then(onfulfilled, onrejected);
  }
  catch(onrejected) {
    return this.#parse().catch(onrejected);
  }
  finally(onfinally) {
    return this.#parse().finally(onfinally);
  }
};
var range = (from, to) => Array.from({ length: to - from }, (_, i) => from + i);
var DEFAULT_RETRY_POLICY = {
  maxRetries: 2,
  backoffInitialMs: 500,
  backoffMaxMs: 5e3,
  backoffJitter: 0.25,
  /** HTTP 408, 429, and 5xx responses. */
  httpStatuses: /* @__PURE__ */ new Set([
    408,
    429,
    ...range(500, 600)
  ]),
  respectRetryAfter: true,
  /** Maximum server retry delay before falling back to backoff. */
  maxRetryAfterMs: 6e4,
  apiConnectionError: true,
  apiTimeoutError: true
};
DEFAULT_RETRY_POLICY.maxRetries;
var isRetryableStatus = (status, policy = DEFAULT_RETRY_POLICY) => policy.httpStatuses.has(status);
var parseRetryAfter = (headers, now = Date.now()) => {
  const ms = Number(headers.get("retry-after-ms"));
  if (headers.has("retry-after-ms") && Number.isFinite(ms) && ms >= 0) return ms;
  const raw = headers.get("retry-after");
  if (raw === null) return void 0;
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return seconds >= 0 ? seconds * 1e3 : void 0;
  const date = Date.parse(raw);
  if (!Number.isNaN(date)) return Math.max(0, date - now);
};
var retryDelayMs = (attempt2, headers, policy = DEFAULT_RETRY_POLICY, random = Math.random) => {
  if (policy.respectRetryAfter && headers !== void 0) {
    const retryAfter = parseRetryAfter(headers);
    if (retryAfter !== void 0 && retryAfter <= policy.maxRetryAfterMs) return retryAfter;
  }
  const exponential = Math.min(policy.backoffInitialMs * 2 ** attempt2, policy.backoffMaxMs);
  return Math.round(exponential * (1 - random() * policy.backoffJitter));
};
var sleep = (ms, signal) => new Promise((resolve2, reject) => {
  if (signal?.aborted) return reject(signal.reason);
  const onAbort = () => {
    clearTimeout(timer);
    reject(signal?.reason);
  };
  const timer = setTimeout(() => {
    signal?.removeEventListener("abort", onAbort);
    resolve2();
  }, ms);
  signal?.addEventListener("abort", onAbort, { once: true });
});
var TypeSafeError = class extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = new.target.name;
  }
};
var isRecord2 = (value) => typeof value === "object" && value !== null;
var extractMessage = (body) => {
  if (typeof body === "string") return body || void 0;
  if (!isRecord2(body)) return void 0;
  const { error, message, detail: detail2 } = body;
  if (typeof error === "string") return error;
  if (isRecord2(error) && typeof error.message === "string") return error.message;
  if (typeof message === "string") return message;
  if (typeof detail2 === "string") return detail2;
  if (isRecord2(detail2) && typeof detail2.message === "string") return detail2.message;
  if (Array.isArray(detail2)) return describeValidationErrors(detail2);
};
var describeValidationErrors = (errors) => {
  const parts = errors.flatMap((e) => {
    if (!isRecord2(e) || typeof e.msg !== "string") return [];
    const loc = Array.isArray(e.loc) ? e.loc.filter((x) => x !== "body").join(".") : "";
    return [loc ? `${loc}: ${e.msg}` : e.msg];
  });
  return parts.length > 0 ? parts.join("; ") : void 0;
};
var MAX_RAW_BODY_IN_MESSAGE = 200;
var APIError = class APIError2 extends TypeSafeError {
  /** HTTP response status code. */
  status;
  /** HTTP response headers. */
  headers;
  /** Parsed JSON, response text, or `undefined` for an empty body. */
  body;
  /** Request ID from `x-typesafe-request-id`, or `undefined` when absent. */
  requestId;
  constructor(status, body, headers, message) {
    super(message ?? APIError2.describe(status, body));
    this.status = status;
    this.body = body;
    this.headers = headers;
    this.requestId = requestIdFrom(headers);
  }
  static describe(status, body) {
    const detail2 = extractMessage(body);
    if (detail2) return `${status} ${detail2}`;
    if (body === void 0) return `${status} status code (no body)`;
    const raw = typeof body === "string" ? body : JSON.stringify(body);
    return `${status} ${raw.length > MAX_RAW_BODY_IN_MESSAGE ? `${raw.slice(0, MAX_RAW_BODY_IN_MESSAGE)}\u2026` : raw}`;
  }
  /** Create the error subclass for an HTTP status code. */
  static fromResponse(status, body, headers) {
    if (status === 400) return new BadRequestError(status, body, headers);
    if (status === 401) return new AuthenticationError(status, body, headers);
    if (status === 403) return new PermissionDeniedError(status, body, headers);
    if (status === 404) return new NotFoundError(status, body, headers);
    if (status === 422) return new UnprocessableEntityError(status, body, headers);
    if (status === 429) return new RateLimitError(status, body, headers);
    if (status >= 500) return new InternalServerError(status, body, headers);
    return new APIError2(status, body, headers);
  }
};
var BadRequestError = class extends APIError {
};
var AuthenticationError = class extends APIError {
};
var PermissionDeniedError = class extends APIError {
};
var NotFoundError = class extends APIError {
};
var UnprocessableEntityError = class extends APIError {
};
var RateLimitError = class extends APIError {
  /** Server retry delay in milliseconds, or `undefined` when absent or invalid. */
  retryAfterMs = parseRetryAfter(this.headers);
};
var InternalServerError = class extends APIError {
};
var APIConnectionError = class extends TypeSafeError {
  constructor(message = "Connection error.", options) {
    super(message, options);
  }
};
var APITimeoutError = class extends APIConnectionError {
  /** Configured timeout in milliseconds. */
  timeoutMs;
  constructor(timeoutMs, options) {
    super(`Request timed out after ${timeoutMs}ms.`, options);
    this.timeoutMs = timeoutMs;
  }
};
var APIUserAbortError = class extends TypeSafeError {
  constructor(message = "Request was aborted.", options) {
    super(message, options);
  }
};
var CONTENT_TYPES = [["image/png", [
  137,
  80,
  78,
  71,
  13,
  10,
  26,
  10
]], ["image/jpeg", [
  255,
  216,
  255
]]];
var REFERENCE = /<image:[0-9a-f]{32}>/g;
var IMAGE = /* @__PURE__ */ Symbol.for("@typesafe-ai/sdk/image");
var TEXT_WITH_ASSETS = /* @__PURE__ */ Symbol.for("@typesafe-ai/sdk/text-with-assets");
var randomHex = () => Array.from(crypto.getRandomValues(/* @__PURE__ */ new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join("");
var isImage = (value) => IMAGE in value;
var isTextWithAssets = (value) => TEXT_WITH_ASSETS in value;
var typeName = (value) => {
  if (value === null) return "null";
  if (typeof value !== "object") return typeof value;
  return Object.prototype.toString.call(value).slice(8, -1);
};
var toBytes = (data) => {
  if (!ArrayBuffer.isView(data) && Object.prototype.toString.call(data) !== "[object ArrayBuffer]") throw new TypeSafeError(`Image data must be file bytes or a Blob; got ${typeName(data)}.`);
  return ArrayBuffer.isView(data) ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : new Uint8Array(data);
};
var contentTypeOf = (bytes) => {
  for (const [contentType, signature] of CONTENT_TYPES) if (signature.every((byte, i) => bytes[i] === byte)) return contentType;
  return "application/octet-stream";
};
var Image = class Image2 {
  type = "image";
  /** The image file bytes, or a `Blob` read when the request is sent. */
  data;
  #reference = `<image:${randomHex()}>`;
  /** @throws {TypeSafeError} `data` is empty or isn't file bytes or a `Blob`. */
  constructor(data) {
    this.data = data instanceof Blob ? data : toBytes(data);
    if ((this.data instanceof Blob ? this.data.size : this.data.byteLength) === 0) throw new TypeSafeError("Image data is empty.");
  }
  /**
  * Create an image from base64-encoded file bytes, decoding them now.
  *
  * @param text - The image file bytes, base64-encoded, without a `data:` URL prefix.
  * @throws {TypeSafeError} `text` isn't valid base64 or decodes to no bytes.
  *
  * @example
  * ```ts
  * const photo = Image.fromBase64(upload.photoBase64);
  * ```
  */
  static fromBase64(text) {
    let binary;
    try {
      binary = atob(text);
    } catch (err) {
      throw new TypeSafeError("Image data must contain valid base64 text.", { cause: err });
    }
    return new Image2(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
  }
  /** The unique reference this image is sent under, for referencing it inside text. */
  toString() {
    return this.#reference;
  }
  /** The reference, written by `JSON.stringify` wherever the image appears in a request. */
  toJSON() {
    return this.#reference;
  }
};
Object.defineProperty(Image.prototype, IMAGE, { value: true });
var TextWithAssets = class {
  /** The text, with each asset replaced by its reference. */
  text;
  /** The assets interpolated into the text, including those in nested `withAssets` text. */
  assets;
  constructor(text, assets) {
    this.text = text;
    this.assets = assets;
  }
  toString() {
    return this.text;
  }
  /** The text, written by `JSON.stringify` wherever this value appears in a request. */
  toJSON() {
    return this.text;
  }
};
Object.defineProperty(TextWithAssets.prototype, TEXT_WITH_ASSETS, { value: true });
var textWithAssets = (text, values) => {
  const interpolated = /* @__PURE__ */ new Map();
  collectAssets(values, interpolated, /* @__PURE__ */ new Set());
  const assets = /* @__PURE__ */ new Map();
  for (const [reference] of text.matchAll(REFERENCE)) {
    const asset = interpolated.get(reference);
    if (asset !== void 0) assets.set(reference, asset);
  }
  return new TextWithAssets(text, [...assets.values()]);
};
var withAssets = Object.assign((strings, ...values) => textWithAssets(strings.reduce((joined, piece, i) => joined + String(values[i - 1]) + piece), values), { join: (values, separator) => textWithAssets(values.join(separator), values) });
var collectAssets = (value, found, visited) => {
  if (typeof value !== "object" || value === null || visited.has(value)) return;
  visited.add(value);
  if (isImage(value)) found.set(String(value), value);
  else if (isTextWithAssets(value)) for (const asset of value.assets) found.set(String(asset), asset);
  else for (const item of Object.values(value)) collectAssets(item, found, visited);
};
var serializeRequest = (payload, assets = {}) => {
  const names = new Map(Object.entries(assets).map(([name, asset]) => [asset, name]));
  const known2 = new Map(Object.values(assets).map((asset) => [String(asset), asset]));
  const json = JSON.stringify(payload, function(key, value) {
    if (typeof value === "number" && !Number.isFinite(value)) return String(value);
    const original = this[key];
    if (typeof original !== "object" || original === null) return value;
    if (isImage(original)) {
      const name = names.get(original);
      if (name !== void 0) return name;
      known2.set(String(original), original);
    } else if (isTextWithAssets(original)) {
      let text = original.text;
      for (const asset of original.assets) {
        const name = names.get(asset);
        if (name === void 0) known2.set(String(asset), asset);
        else text = text.replaceAll(String(asset), name);
      }
      return text;
    }
    return value;
  });
  const unreferenced = Object.keys(assets).filter((name) => !json.includes(JSON.stringify(name).slice(1, -1)));
  if (unreferenced.length > 0) throw new TypeSafeError(`Assets not referenced in the request: ${unreferenced.join(", ")}. Write each name in \`assets\` into \`state\`, question instructions, or criteria.`);
  const sent = new Map(Object.entries(assets));
  const missing = /* @__PURE__ */ new Set();
  for (const [reference] of json.matchAll(REFERENCE)) {
    if (sent.has(reference)) continue;
    const asset = known2.get(reference);
    if (asset === void 0) missing.add(reference);
    else sent.set(reference, asset);
  }
  if (missing.size > 0) throw new TypeSafeError(`Image references without an attached image: ${[...missing].join(", ")}. Tag template literals that interpolate images with \`withAssets\`.`);
  return {
    json,
    assets: sent.size === 0 ? void 0 : Object.fromEntries(sent)
  };
};
var MultipartBody = class {
  /** The JSON payload, sent as the `request` part. */
  payload;
  /** The `Content-Type` header value, including the boundary. */
  contentType;
  /** The encoded body. */
  content;
  constructor(payload, parts) {
    const boundary = randomHex();
    const chunks = [];
    for (const { name, contentType, content, filename } of [{
      name: "request",
      contentType: "application/json",
      content: JSON.stringify(payload)
    }, ...parts]) {
      const disposition = filename === void 0 ? `name="${name}"` : `name="${name}"; filename="${filename}"`;
      chunks.push(`--${boundary}\r
Content-Disposition: form-data; ${disposition}\r
`, `Content-Type: ${contentType}\r
\r
`, content, "\r\n");
    }
    chunks.push(`--${boundary}--\r
`);
    this.payload = payload;
    this.contentType = `multipart/form-data; boundary=${boundary}`;
    this.content = new Blob(chunks);
  }
};
var readImage = async (alias, { data }) => {
  if (!(data instanceof Blob)) return data;
  try {
    return new Uint8Array(await data.arrayBuffer());
  } catch (err) {
    throw new TypeSafeError(`Asset "${alias}" could not be read: ${err.message}`, { cause: err });
  }
};
var unshared = (bytes) => bytes.buffer instanceof ArrayBuffer ? bytes : bytes.slice();
var copyAssetBytes = (assets) => Object.fromEntries(Object.entries(assets).map(([alias, asset]) => [alias, asset.data instanceof Uint8Array ? new Image(asset.data.slice()) : asset]));
var encodeAssets = async (payload, assets) => {
  const read2 = await Promise.all(Object.entries(assets).map(async ([alias, asset]) => [
    alias,
    asset,
    await readImage(alias, asset)
  ]));
  const parts = [];
  const entries = [];
  for (const [alias, { type }, data] of read2) {
    const name = `asset-${parts.length}`;
    parts.push({
      name,
      contentType: contentTypeOf(data),
      content: unshared(data),
      filename: name
    });
    entries.push([alias, {
      type,
      part: name
    }]);
  }
  return new MultipartBody({
    ...payload,
    assets: Object.fromEntries(entries)
  }, parts);
};
var g$1 = globalThis;
var zlib = () => {
  try {
    return g$1.process?.getBuiltinModule?.("node:zlib");
  } catch {
    return;
  }
};
var hasZstd = () => typeof zlib()?.zstdCompress === "function";
var resolveCompression = (compression) => {
  if (compression === void 0) return hasZstd() ? "zstd" : false;
  if (compression === false) return false;
  if (compression === "zstd") {
    if (!hasZstd()) throw new TypeSafeError("zstd compression requires Node.js 22.15 or newer. Pass `compression: false` instead.");
    return compression;
  }
  throw new TypeSafeError(`\`compression\` must be "zstd" or false, got ${JSON.stringify(compression)}.`);
};
var zstd = async (body) => {
  const data = new Uint8Array(await body.arrayBuffer());
  const compressed = await new Promise((resolve2, reject) => {
    zlib()?.zstdCompress?.(data, (err, result) => err ? reject(err) : resolve2(result));
  });
  return new Uint8Array(compressed);
};
var byteLength = (body) => typeof body === "string" ? new TextEncoder().encode(body).byteLength : body.size;
var compressBody = (body) => zstd(typeof body === "string" ? new Blob([body]) : body);
var ENV = {
  /** Required API key; used when `apiKey` is omitted. */
  apiKey: "TYPESAFE_API_KEY",
  /** API root; defaults to `https://api.typesafe.ai`. */
  baseURL: "TYPESAFE_BASE_URL",
  /** Default model name; defaults to `jev-latest`. */
  defaultModel: "TYPESAFE_DEFAULT_MODEL",
  /** Log level; defaults to `warn`. */
  logLevel: "TYPESAFE_LOG_LEVEL"
};
var readEnv = (name) => {
  if (typeof process === "undefined" || !process.env) return void 0;
  return process.env[name]?.trim() || void 0;
};
var fromCodeOrEnv = (fromCode, envVar) => fromCode ?? readEnv(envVar);
var LOG_LEVELS = [
  "debug",
  "info",
  "warn",
  "error",
  "off"
];
var DEFAULT_LOG_LEVEL = "warn";
var isLogLevel = (value) => LOG_LEVELS.includes(value);
var parseLogLevel = (value, source) => {
  if (isLogLevel(value)) return value;
  throw new TypeSafeError(`Invalid log level "${value}" from ${source}. Expected one of: ${LOG_LEVELS.join(", ")}.`);
};
var PREFIX = "[typesafe-sdk]";
var consoleLogger = {
  debug: (message, ...args) => console.debug(`${PREFIX} ${message}`, ...args),
  info: (message, ...args) => console.info(`${PREFIX} ${message}`, ...args),
  warn: (message, ...args) => console.warn(`${PREFIX} ${message}`, ...args),
  error: (message, ...args) => console.error(`${PREFIX} ${message}`, ...args)
};
var RANK = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  off: 4
};
var drop = () => {
};
var withLevel = (sink, level) => {
  const enabled = (at) => RANK[at] >= RANK[level];
  return {
    debug: enabled("debug") ? (message, ...args) => sink.debug(message, ...args) : drop,
    info: enabled("info") ? (message, ...args) => sink.info(message, ...args) : drop,
    warn: enabled("warn") ? (message, ...args) => sink.warn(message, ...args) : drop,
    error: enabled("error") ? (message, ...args) => sink.error(message, ...args) : drop
  };
};
var KEY_HEADERS = /* @__PURE__ */ new Set([
  "authorization",
  "proxy-authorization",
  "x-api-key"
]);
var OPAQUE_HEADERS = /* @__PURE__ */ new Set(["cookie", "set-cookie"]);
var redactKey = (value) => {
  const [scheme, secret] = value.includes(" ") ? value.split(/\s+/, 2) : [void 0, value];
  const tail = secret && secret.length > 8 ? secret.slice(-4) : "";
  return `${scheme ? `${scheme} ` : ""}***${tail}`;
};
var redact2 = (name, value) => {
  const lower = name.toLowerCase();
  if (KEY_HEADERS.has(lower)) return redactKey(value);
  if (OPAQUE_HEADERS.has(lower)) return "***";
  return value;
};
var redactHeaders = (headers) => Object.fromEntries(Object.entries(headers).map(([name, value]) => [name, redact2(name, value)]));
var isObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
var validateChoice = (name, { criteria }) => {
  if (!isObject(criteria)) throw new TypeSafeError(`Choice question "${name}" has criteria that are not a map; choice criteria must be a map of labels to descriptions.`);
  if (Object.keys(criteria).length === 0) throw new TypeSafeError(`Choice question "${name}" has no criteria; at least one choice is required.`);
};
var validateNoul = (name, { instructions, criteria }) => {
  if (criteria != null && !isObject(criteria)) throw new TypeSafeError(`Noul question "${name}" criteria must be an object.`);
  if (instructions == null && !Object.values(criteria ?? {}).some((value) => value != null)) throw new TypeSafeError(`Noul question "${name}" has neither instructions nor criteria; at least one is required.`);
};
var validateQuestions = (questions) => {
  if (Object.keys(questions).length === 0) throw new TypeSafeError("At least one question is required.");
  for (const [name, question] of Object.entries(questions)) {
    if (question.type === "choice") validateChoice(name, question);
    if (question.type === "noul") validateNoul(name, question);
    if (question.type !== "score") continue;
    if (!Array.isArray(question.criteria)) throw new TypeSafeError(`Score question "${name}" has criteria that are not a list; score criteria must be a list of descriptions indexed by score from zero.`);
    if (question.criteria.length < 2) throw new TypeSafeError(`Score question "${name}" has ${question.criteria.length} criteria; at least two scores are required.`);
  }
};
var Models = class {
  #transport;
  constructor(transport) {
    this.#transport = transport;
  }
  /** List the models available to the account. */
  list(options = {}) {
    return this.#transport.request("GET", "/v1/models", options).map(unwrapModels);
  }
};
var unwrapModels = (wire) => {
  if (Array.isArray(wire?.models)) return wire.models;
  throw new TypeSafeError("Unexpected response shape from GET /v1/models; expected { models: [...] }.");
};
var g = globalThis;
var isBrowser = () => typeof g.window !== "undefined" && typeof g.window.document !== "undefined" && typeof g.navigator !== "undefined";
var describeRuntime = () => {
  const platform = g.process?.platform && g.process?.arch ? ` (${g.process.platform}; ${g.process.arch})` : "";
  if (g.Bun?.version) return `bun/${g.Bun.version}${platform}`;
  if (g.Deno?.version?.deno) return `deno/${g.Deno.version.deno}${platform}`;
  if (g.EdgeRuntime !== void 0) return "vercel-edge";
  if (g.navigator?.userAgent === "Cloudflare-Workers") return "cloudflare-workers";
  if (g.process?.versions?.node) return `node/${g.process.versions.node}${platform}`;
  if (isBrowser()) return "browser";
  return "unknown";
};
var VERSION = "0.7.0";
var missingApiKey = () => {
  throw new TypeSafeError(`No API key was provided. Pass \`apiKey\` to the TypeSafeClient constructor or set the ${ENV.apiKey} environment variable.`);
};
var missingFetch = () => {
  throw new TypeSafeError("No global `fetch` is available in this runtime. Pass a `fetch` implementation to the TypeSafeClient constructor.");
};
var refuseBrowser = () => {
  throw new TypeSafeError("TypeSafeClient is running in a browser, which would expose your API key to anyone using the page. Call the API from a server instead, or pass `dangerouslyAllowBrowser: true` if you understand the risk.");
};
var defaultFetch = (input, init) => globalThis.fetch(input, init);
var assertNonNegativeInteger = (name, value) => {
  if (!Number.isInteger(value) || value < 0) throw new TypeSafeError(`\`${name}\` must be a non-negative integer, got ${String(value)}.`);
  return value;
};
var assertPositiveMs = (name, value) => {
  if (!Number.isFinite(value) || value <= 0) throw new TypeSafeError(`\`${name}\` must be a positive number of milliseconds, got ${String(value)}.`);
  return value;
};
var assertNonNegativeMs = (name, value) => {
  if (!Number.isFinite(value) || value < 0) throw new TypeSafeError(`\`${name}\` must be a non-negative number of milliseconds, got ${String(value)}.`);
  return value;
};
var assertFraction = (name, value) => {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new TypeSafeError(`\`${name}\` must be between 0 and 1, got ${String(value)}.`);
  return value;
};
var assertStatusSet = (name, statuses) => {
  for (const status of statuses) if (!Number.isInteger(status) || status < 100 || status > 999) throw new TypeSafeError(`\`${name}\` must contain HTTP status codes, got ${String(status)}.`);
  return statuses;
};
var resolveRetryPolicy = (base, overrides) => {
  const o = overrides ?? {};
  return {
    maxRetries: o.maxRetries === void 0 ? base.maxRetries : assertNonNegativeInteger("retry.maxRetries", o.maxRetries),
    backoffInitialMs: o.backoffInitialMs === void 0 ? base.backoffInitialMs : assertNonNegativeMs("retry.backoffInitialMs", o.backoffInitialMs),
    backoffMaxMs: o.backoffMaxMs === void 0 ? base.backoffMaxMs : assertNonNegativeMs("retry.backoffMaxMs", o.backoffMaxMs),
    backoffJitter: o.backoffJitter === void 0 ? base.backoffJitter : assertFraction("retry.backoffJitter", o.backoffJitter),
    httpStatuses: new Set(o.httpStatuses === void 0 ? base.httpStatuses : assertStatusSet("retry.httpStatuses", o.httpStatuses)),
    respectRetryAfter: o.respectRetryAfter ?? base.respectRetryAfter,
    maxRetryAfterMs: o.maxRetryAfterMs === void 0 ? base.maxRetryAfterMs : assertNonNegativeMs("retry.maxRetryAfterMs", o.maxRetryAfterMs),
    apiConnectionError: o.apiConnectionError ?? base.apiConnectionError,
    apiTimeoutError: o.apiTimeoutError ?? base.apiTimeoutError
  };
};
var isRetryableError = (err, policy) => {
  if (err instanceof APITimeoutError) return policy.apiTimeoutError;
  if (err instanceof APIConnectionError) return policy.apiConnectionError;
  return false;
};
var resolveLogLevel = (fromCode) => {
  if (fromCode !== void 0) return parseLogLevel(fromCode, "the `logLevel` option");
  const fromEnv = readEnv(ENV.logLevel);
  if (fromEnv !== void 0) return parseLogLevel(fromEnv, ENV.logLevel);
  return DEFAULT_LOG_LEVEL;
};
var stripTrailingSlashes = (url) => url.replace(/\/+$/, "");
var mergeHeaders = (...sources) => {
  const entries = /* @__PURE__ */ new Map();
  for (const source of sources) for (const [name, value] of Object.entries(source)) if (value === void 0) entries.delete(name.toLowerCase());
  else entries.set(name.toLowerCase(), [name, value]);
  return Object.fromEntries(entries.values());
};
var bufferResponse = async (response, signal) => {
  const reader = response.clone().body?.getReader();
  if (!reader) return;
  const original = response.body?.getReader();
  const cancel = () => {
    reader.cancel(signal.reason).catch(() => {
    });
    original?.cancel(signal.reason).catch(() => {
    });
  };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    if (signal.aborted) cancel();
    signal.throwIfAborted();
    while (!(await reader.read()).done) signal.throwIfAborted();
    signal.throwIfAborted();
  } finally {
    signal.removeEventListener("abort", cancel);
    reader.releaseLock();
    original?.releaseLock();
  }
};
var untilAborted = (start, signal) => {
  if (signal === void 0) return start();
  return new Promise((resolve2, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    start().then((value) => {
      signal.removeEventListener("abort", onAbort);
      resolve2(value);
    }, (err) => {
      signal.removeEventListener("abort", onAbort);
      reject(err);
    });
  });
};
var RUNTIME = describeRuntime();
var rejectedAPIPromise = (err) => {
  const response = Promise.reject(err);
  return new APIPromise(response, () => response);
};
var TypeSafeClient = class {
  /** API key excluded from serialization and public properties. */
  #apiKey;
  /** API root with trailing slashes removed. */
  baseURL;
  /** Model used when a request omits `model`. */
  defaultModel;
  /** Configured log verbosity. */
  logLevel;
  /** The configured logger, filtered to `logLevel`. */
  logger;
  /** Retry settings with constructor overrides applied. */
  retry;
  /** Timeout per attempt in milliseconds. */
  timeout;
  /** Additional headers sent with each request. */
  defaultHeaders;
  /** Request body compression, or `false` when bodies are sent uncompressed. */
  compression;
  /** HTTP fetch implementation. */
  fetch;
  /** The models available to the account. */
  models;
  #requestCount = 0;
  /**
  * Create a client for the TypeSafe AI API.
  *
  * Explicit options take precedence over environment variables, then SDK defaults.
  * Empty or whitespace-only environment values are ignored.
  *
  * @throws {TypeSafeError} The API key is missing, configuration is invalid, the runtime is
  *   unsupported, or the runtime lacks the requested compression.
  */
  constructor(config = {}) {
    if (isBrowser() && !config.dangerouslyAllowBrowser) refuseBrowser();
    this.#apiKey = fromCodeOrEnv(config.apiKey, ENV.apiKey) ?? missingApiKey();
    this.baseURL = stripTrailingSlashes(fromCodeOrEnv(config.baseURL, ENV.baseURL) ?? "https://api.typesafe.ai");
    this.defaultModel = fromCodeOrEnv(config.defaultModel, ENV.defaultModel) ?? "jev-latest";
    this.logLevel = resolveLogLevel(config.logLevel);
    this.logger = withLevel(config.logger ?? consoleLogger, this.logLevel);
    this.retry = resolveRetryPolicy(DEFAULT_RETRY_POLICY, config.retry);
    this.timeout = assertPositiveMs("timeout", config.timeout ?? 1e4);
    this.defaultHeaders = { ...config.defaultHeaders };
    this.compression = resolveCompression(config.compression);
    if (config.fetch === void 0 && typeof globalThis.fetch !== "function") missingFetch();
    this.fetch = config.fetch ?? defaultFetch;
    const transport = {
      request: (method, path, options) => this.#request(method, path, options),
      defaultModel: this.defaultModel
    };
    this.models = new Models(transport);
  }
  /**
  * Answer named questions about text, structured state, or assets.
  *
  * @param request - State, questions, an optional model override, and optional assets.
  *   Assets in `state`, question content, or `withAssets` text are sent under their references.
  * @param options - Per-call timeout, retry, headers, and cancellation settings.
  * @returns Answers typed by question name and criteria, with model and token usage. Every
  *   failure below rejects the returned promise; the call itself doesn't throw.
  * @throws {TypeSafeError} State is `null` or omitted, questions are empty, score criteria are not
  *   a list of at least two entries, choice criteria are not a nonempty map, a noul question has
  *   neither instructions nor a described outcome, a string holds the reference of an asset not
  *   attached to the request, a name in `assets` doesn't appear in the request, or a `Blob`
  *   asset can't be read.
  * @throws {APIError} The server returns a non-2xx response after retries.
  * @throws {APIConnectionError} The request cannot connect or times out after retries.
  * @throws {APIUserAbortError} The caller aborts the request.
  *
  * @example
  * ```ts
  * const { answers } = await client.systemOne({
  *   state: "I was charged twice. Please help.",
  *   questions: { billing: noul("Is this about billing?") },
  * });
  * console.log(answers.billing.noul);
  * ```
  */
  systemOne(request, options = {}) {
    let body;
    try {
      if (request.state == null) throw new TypeSafeError("State is required.");
      validateQuestions(request.questions);
      const { assets, ...rest } = request;
      const { json, assets: sent } = serializeRequest({
        ...rest,
        model: request.model ?? this.defaultModel
      }, assets);
      const payload = JSON.parse(json);
      const copied = sent === void 0 ? void 0 : copyAssetBytes(sent);
      body = copied === void 0 ? payload : () => encodeAssets(payload, copied);
    } catch (err) {
      return rejectedAPIPromise(err);
    }
    return this.#request("POST", "/v1/systemone", {
      ...options,
      body
    });
  }
  /** Send a request and parse its response body. */
  #request(method, path, options = {}) {
    let resolved;
    try {
      resolved = {
        method,
        path,
        body: options.body,
        headers: mergeHeaders(this.defaultHeaders, options.headers ?? {}),
        signal: options.signal,
        timeout: options.timeout === void 0 ? this.timeout : assertPositiveMs("timeout", options.timeout),
        retry: resolveRetryPolicy(this.retry, options.retry)
      };
    } catch (err) {
      return rejectedAPIPromise(err);
    }
    const tag = `#${++this.#requestCount} ${method} ${path}`;
    return new APIPromise(this.fetchWithRetries(tag, resolved), async (res) => {
      const parsed = await parseBody(res);
      this.logger.debug(`${tag} <- body`, parsed);
      return parsed;
    });
  }
  /** Retry eligible failures, logging attempt summaries at `info` and headers and bodies at `debug`. */
  async fetchWithRetries(tag, req) {
    const url = `${this.baseURL}${req.path}`;
    let resolved = req.body;
    if (typeof resolved === "function") try {
      resolved = await untilAborted(resolved, req.signal);
    } catch (err) {
      if (!req.signal?.aborted) throw err;
      this.logger.info(`${tag} aborted by caller while reading assets`);
      throw new APIUserAbortError(void 0, { cause: err });
    }
    const multipart = resolved instanceof MultipartBody ? resolved : void 0;
    const payload = multipart === void 0 ? resolved : multipart.payload;
    const encoded = multipart?.content ?? (payload === void 0 ? void 0 : JSON.stringify(payload));
    const encoding = encoded === void 0 || byteLength(encoded) < 1024 ? false : this.compression;
    let body = encoded;
    if (encoded !== void 0 && encoding !== false) try {
      body = await untilAborted(() => compressBody(encoded), req.signal);
    } catch (err) {
      if (!req.signal?.aborted) throw err;
      this.logger.info(`${tag} aborted by caller while compressing the body`);
      throw new APIUserAbortError(void 0, { cause: err });
    }
    const headers = mergeHeaders(req.headers, {
      Authorization: `Bearer ${this.#apiKey}`,
      Accept: "application/json",
      "User-Agent": `typesafe-sdk/${VERSION}`,
      "X-TypeSafe-SDK": `typesafe-sdk/${VERSION}`,
      "X-TypeSafe-Runtime": RUNTIME,
      "Content-Type": multipart?.contentType ?? (body === void 0 ? void 0 : "application/json"),
      "Content-Encoding": encoding === false ? void 0 : encoding,
      "X-TypeSafe-Retry-Count": void 0
    });
    for (let attempt2 = 0; ; attempt2++) {
      const retriesLeft = req.retry.maxRetries - attempt2;
      const attemptHeaders = attempt2 === 0 ? headers : {
        ...headers,
        "X-TypeSafe-Retry-Count": String(attempt2)
      };
      this.logger.debug(`${tag} -> ${url}`, {
        headers: redactHeaders(attemptHeaders),
        body: payload
      });
      const started = Date.now();
      let res;
      try {
        res = await this.attempt(tag, url, {
          method: req.method,
          headers: attemptHeaders,
          body
        }, req);
      } catch (err) {
        if (err instanceof APIUserAbortError || retriesLeft <= 0) throw err;
        if (!isRetryableError(err, req.retry)) throw err;
        await this.backOff(tag, attempt2, retriesLeft, err.message, void 0, req);
        continue;
      }
      const requestId = requestIdFrom(res.headers);
      this.logger.info(`${tag} <- ${res.status} in ${Date.now() - started}ms${requestId ? ` (request ${requestId})` : ""}`);
      if (res.ok) return res;
      const errorBody = await parseBody(res);
      this.logger.debug(`${tag} <- error body`, errorBody);
      const error = APIError.fromResponse(res.status, errorBody, res.headers);
      if (retriesLeft <= 0 || !isRetryableStatus(res.status, req.retry)) throw error;
      await this.backOff(tag, attempt2, retriesLeft, `${res.status}`, res.headers, req);
    }
  }
  /**
  * One HTTP round trip, including body delivery, with a timeout. The caller's signal and our
  * timer both abort the same controller; we check which fired to choose the error class.
  */
  async attempt(tag, url, init, { signal, timeout }) {
    const controller = new AbortController();
    const abortFromCaller = () => controller.abort(signal?.reason);
    if (signal?.aborted) abortFromCaller();
    signal?.addEventListener("abort", abortFromCaller, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeout);
    const started = Date.now();
    const elapsed = () => `${Date.now() - started}ms`;
    try {
      const response = await this.fetch(url, {
        ...init,
        signal: controller.signal
      });
      await bufferResponse(response, controller.signal);
      return response;
    } catch (err) {
      if (signal?.aborted) {
        this.logger.info(`${tag} aborted by caller after ${elapsed()}`);
        throw new APIUserAbortError(void 0, { cause: err });
      }
      if (timedOut) {
        this.logger.info(`${tag} timed out after ${elapsed()}`);
        throw new APITimeoutError(timeout, { cause: err });
      }
      this.logger.info(`${tag} connection error after ${elapsed()}`, err);
      throw new APIConnectionError(err instanceof Error ? `Connection error: ${err.message}` : void 0, { cause: err });
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abortFromCaller);
    }
  }
  /** Wait before retrying; caller cancellation throws `APIUserAbortError`. */
  async backOff(tag, attempt2, retriesLeft, reason, headers, { retry, signal }) {
    const delay = retryDelayMs(attempt2, headers, retry);
    const nth = attempt2 + 1;
    const total = attempt2 + retriesLeft;
    this.logger.info(`${tag} retrying in ${delay}ms (retry ${nth}/${total}) after ${reason}`);
    try {
      await sleep(delay, signal);
    } catch (err) {
      this.logger.info(`${tag} aborted by caller while waiting to retry`);
      throw new APIUserAbortError(void 0, { cause: err });
    }
  }
};
var parseBody = async (res) => {
  const text = await res.text();
  if (text.length === 0) return void 0;
  if ((res.headers.get("content-type") ?? "").includes("application/json")) try {
    return JSON.parse(text);
  } catch {
    return text;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

// src/core/provider.ts
var PROVIDER_VALUES = [
  "auto",
  "openrouter-first",
  "typesafe",
  "openrouter"
];
var PROVIDERS = ["typesafe", "openrouter"];
var HOSTS = {
  typesafe: "https://api.typesafe.ai",
  openrouter: "https://openrouter.ai/api"
};
var KEY_VARIABLES = {
  typesafe: "TYPESAFE_API_KEY",
  openrouter: "OPENROUTER_API_KEY"
};
var FIRST_ATTEMPT_TIMEOUT_MS = 2e3;
var MODEL = "jev-latest";
var DEFAULT_VALUE = "typesafe";
var FALLBACK_STATUSES = /* @__PURE__ */ new Set([
  401,
  402,
  403,
  404,
  408,
  429
]);
var SERVER_ERRORS = { min: 500, max: 599 };
var ORDER = {
  auto: PROVIDERS,
  "openrouter-first": ["openrouter", "typesafe"],
  typesafe: ["typesafe"],
  openrouter: ["openrouter"]
};
var parseProvider = (value) => typeof value === "string" && Object.hasOwn(ORDER, value) ? value : void 0;
var resolve = (value) => parseProvider(value) ?? DEFAULT_VALUE;
var order = (value) => ORDER[resolve(value)];
async function collectKeys(value, lookup2) {
  const keys = {};
  for (const provider of order(value)) {
    const key = await lookup2(provider);
    if (key !== void 0) keys[provider] = key;
  }
  return keys;
}
function plan(value, keys) {
  const providers = order(value).filter((p) => Boolean(keys[p]));
  return providers.map(
    (provider, i) => i < providers.length - 1 ? {
      provider,
      model: MODEL,
      timeout: FIRST_ATTEMPT_TIMEOUT_MS,
      retry: { maxRetries: 0 }
    } : { provider, model: MODEL }
  );
}
function fallsBack(err) {
  if (err instanceof APIUserAbortError) return false;
  if (err instanceof APIConnectionError) return true;
  if (!(err instanceof APIError)) return false;
  const { status } = err;
  return FALLBACK_STATUSES.has(status) || status >= SERVER_ERRORS.min && status <= SERVER_ERRORS.max;
}

// src/core/scope.ts
var SCOPE_VALUES = ["core", "extended"];
var DEFAULT_SCOPE = "core";
var parseScope = (value) => SCOPE_VALUES.find((known2) => known2 === value);
var resolveScope = (value) => parseScope(value) ?? DEFAULT_SCOPE;

// src/core/settings.ts
var VALUE_SETTINGS = ["provider", "scope"];
var KEY_SETTINGS = ["typesafe_key", "openrouter_key"];
var SETTING_NAMES = [...VALUE_SETTINGS, ...KEY_SETTINGS];
var TOOL_NAME = "model_router_config";
var KEY_PROVIDERS = {
  typesafe_key: "typesafe",
  openrouter_key: "openrouter"
};
var PROVIDER_NAMES = {
  typesafe: "TypeSafe",
  openrouter: "OpenRouter"
};
var LABEL_SEPARATOR = " - ";
var TEXTS = {
  provider: {
    values: PROVIDER_VALUES,
    resolve,
    about: "which providers score subagent calls",
    question: "Which providers should score subagent calls?",
    consequences: {
      auto: "TypeSafe, then OpenRouter if TypeSafe fails",
      "openrouter-first": "OpenRouter, then TypeSafe if OpenRouter fails",
      typesafe: "TypeSafe only",
      openrouter: "OpenRouter only"
    }
  },
  scope: {
    values: SCOPE_VALUES,
    resolve: resolveScope,
    about: "which agent calls the router routes",
    question: "Which agent calls should the router route?",
    consequences: {
      core: "today's routing: built-in general agents only",
      extended: "also routes other agents that pass no model"
    }
  }
};
var isValueSetting = (name) => VALUE_SETTINGS.some((known2) => known2 === name);
var isKeySetting = (name) => KEY_SETTINGS.some((known2) => known2 === name);
var keyProvider = (setting) => KEY_PROVIDERS[setting];
var isValue = (setting, value) => TEXTS[setting].values.some((known2) => known2 === value);
var valueLine = (setting, value) => setting === "provider" ? `provider: ${value} (${order(value).join(", then ")})` : `scope: ${resolveScope(value)}`;
var useOneOf = (setting) => `${setting}: use one of ${TEXTS[setting].values.join(", ")}`;
var unchanged = (setting, reason) => `${setting} unchanged: ${reason}`;
var unchangedBy = (setting, err) => unchanged(setting, errorText(err));
var alreadyValue = (value) => `already ${value}`;
var NO_ANSWER = "no answer from the dialog";
var NOT_OFFERED = "the answer was not one of the offered values";
var keyLine = (provider, state) => `${provider} key: ${state}`;
var keyNotSaved = (provider) => `${provider} key not saved`;
var label = (setting, value) => `${value}${LABEL_SEPARATOR}${TEXTS[setting].consequences[value]}`;
function ask(setting, current) {
  const { values, resolve: resolve2, question } = TEXTS[setting];
  const first = resolve2(current);
  const sorted = [first, ...values.filter((value) => value !== first)];
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
var settingsReport = (provider, scope, extra, keys) => [
  valueLine("provider", provider),
  valueLine("scope", scope),
  ...extra,
  ...order(provider).map(
    (name) => keyLine(name, keys[name] === void 0 ? "unset" : "set")
  )
].join("\n");
var toolDescription = (names, returned = "the provider and scope") => `Reads the router's settings. With no input it returns ${returned}, and whether each key the provider allows is set. With a setting name (${names.join(", ")}) the plugin asks the person in its own dialog and writes their choice. Never pass a value or a key: the person supplies them in the dialog.`;
var TOOL_LABEL = "Model Router settings";
var badCall = (names) => `Unknown setting. Pass no setting, or one of: ${names.join(", ")}`;
function describeCommand(setting) {
  const { about, values } = TEXTS[setting];
  return `Shows or changes ${about}: ${values.join(", ")}.`;
}
var COMMAND_DESCRIPTIONS = {
  provider: describeCommand("provider"),
  scope: describeCommand("scope")
};

// src/core/models.ts
var MODELS = "models";
var MAX_CANDIDATES = 4;
var SHOW_ALL = "Show the whole list";
var ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/+-]{0,99}$/;
var significant = new Intl.NumberFormat("en-US", {
  maximumSignificantDigits: 3,
  useGrouping: false
});
var compact = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumSignificantDigits: 3
});
var known = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0;
function detail({ input, output, context }) {
  const prices2 = [
    known(input) ? `$${significant.format(input)} in` : void 0,
    known(output) ? `$${significant.format(output)} out` : void 0
  ].filter((part) => part !== void 0);
  const parts = [
    prices2.length > 0 ? `${prices2.join(", ")} per 1M tokens` : void 0,
    known(context) ? `${compact.format(context)} context` : void 0
  ].filter((part) => part !== void 0);
  return parts.length > 0 ? parts.join(", ") : void 0;
}
var usable = (listed2) => listed2.filter(
  (model) => typeof model.id === "string" && ID_PATTERN.test(model.id)
);
function listing(listed2) {
  const models = usable(listed2);
  return [
    `models the person can run: ${models.length}`,
    ...models.map((model) => {
      const words = detail(model);
      return words === void 0 ? `- ${model.id}` : `- ${model.id} (${words})`;
    })
  ].join("\n");
}
var unavailable = (err) => `models unavailable: ${errorText(err)}`;
var label2 = (model) => {
  const words = detail(model);
  return words === void 0 ? model.id : `${model.id}${LABEL_SEPARATOR}${words}`;
};
async function ask2(writer2, slot, question, options) {
  try {
    return await writer2.select(slot, question, options);
  } catch {
    return void 0;
  }
}
async function choose(port, writer2, slot, candidates) {
  const setting = slotSetting(slot);
  const refusal = writer2.authorize();
  if (refusal !== void 0) return unchanged(setting, refusal);
  let models;
  try {
    models = usable(await port.list());
  } catch (err) {
    return unchanged(setting, unavailable(err));
  }
  if (models.length === 0) return unchanged(setting, listing(models));
  let current;
  try {
    current = await writer2.current(slot);
  } catch (err) {
    return unchangedBy(setting, err);
  }
  const question = `Which model should the ${slot} level run? ${setting} is ${current ?? "unset"} now.`;
  const first = [];
  for (const id of Array.isArray(candidates) ? candidates : []) {
    const model2 = models.find((listed2) => listed2.id === id);
    if (model2 !== void 0 && !first.includes(model2)) first.push(model2);
    if (first.length === MAX_CANDIDATES) break;
  }
  let answer = await ask2(writer2, slot, question, [
    ...first.map(label2),
    SHOW_ALL
  ]);
  let from = first;
  if (answer === SHOW_ALL) {
    answer = await ask2(writer2, slot, question, models.map(label2));
    from = models;
  }
  if (answer === void 0) return unchanged(setting, NO_ANSWER);
  const model = from.find((listed2) => label2(listed2) === answer);
  if (model === void 0) return unchanged(setting, NOT_OFFERED);
  try {
    return slotLine(writer2.name(slot), await writer2.write(slot, model.id));
  } catch (err) {
    return unchangedBy(setting, err);
  }
}
async function runModels(port, params) {
  const { setting, candidates } = params;
  if (setting === MODELS) {
    try {
      return listing(await port.list());
    } catch (err) {
      return unavailable(err);
    }
  }
  const slot = SLOTS.find((each) => slotSetting(each) === setting);
  if (slot === void 0) return void 0;
  return port.writer === null ? port.help(slot) : choose(port, port.writer, slot, candidates);
}
var modelToolSentences = (writable) => [
  "With models it returns the models the person can run.",
  ...writable ? [
    "For a model setting, pass up to four ids from models as candidates: the dialog offers them and an entry that shows the whole list."
  ] : []
].join(" ");
var CANDIDATES_DESCRIPTION = "Up to four model ids from the models list. The person picks in the plugin's dialog. Never a value to write.";

// src/core/reasons.ts
var CALLER_EFFORT = "caller effort";
var CONFIG_EFFORT = "config effort";
var UNREADABLE = "settings unreadable";
var KEY_UNSET = "key unset";
var BAD_REPLY = "bad reply";
var TIMEOUT = "timeout";
var FAILED = "failed";
var NETWORK_ERROR = "network error";
var REJECTED_REQUEST = "rejected request";
var httpStatus = (status) => `HTTP ${status}`;
var CANCELLED = "cancelled";
var outsideCoreScope = (id) => `${id} is outside the core scope`;
var agentDiscoveryFailed = (id) => `${id} agent discovery failed`;
var agentUnknown = (id) => `${id} agent unknown`;
var setsOwnModel = (id) => `${id} sets its own model`;

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
var NARROWABLE = ["auto", "openrouter-first"];
function narrow(global, project) {
  const value = resolve(global);
  return NARROWABLE.includes(value) && (project === "typesafe" || project === "openrouter") ? project : value;
}
async function readSettings(omp, cwd) {
  const plugin = omp.plugin ?? FALLBACK_NAME;
  try {
    const [global, effective] = await Promise.all([
      readGlobal(omp.getPluginsLockfile(), plugin),
      omp.getPluginSettings(plugin, cwd)
    ]);
    const { provider: fromGlobal } = global;
    const { provider: fromProject, scope } = effective;
    return {
      provider: narrow(fromGlobal, fromProject),
      scope: resolveScope(scope)
    };
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
async function findKeys(ctx, value) {
  const keys = await collectKeys(value, (provider) => findKey(ctx, provider));
  return { attempts: plan(value, keys), keys };
}
async function findKey(ctx, provider) {
  try {
    const key = await ctx.modelRegistry.getApiKeyForProvider(provider);
    const trimmed = nonEmpty(key);
    if (trimmed !== void 0) return trimmed;
  } catch {
  }
  return nonEmpty(process.env[KEY_VARIABLES[provider]]);
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

// src/adapters/omp/key.ts
var KEY_MAX_LENGTH = 512;
var PADDED_LABELS = ["Yes", "No"];
var LINE_BREAK = /[\r\n\u2028\u2029]/;
function keyFrom(answer) {
  if (typeof answer !== "string" || LINE_BREAK.test(answer)) return void 0;
  const key = answer.trim();
  return key === "" || key.length > KEY_MAX_LENGTH || PADDED_LABELS.includes(key) ? void 0 : key;
}
var keyQuestion = (provider, replaces) => `Enter your ${PROVIDER_NAMES[provider]} API key. It goes to the harness's credential store.${replaces ? " It replaces the key that is set now." : ""}`;
async function changeKey(ctx, setting) {
  const provider = keyProvider(setting);
  if (!ctx.hasUI) return keyNotSaved(provider);
  try {
    const replaces = await findKey(ctx, provider) !== void 0;
    const key = keyFrom(await ctx.ui.input(keyQuestion(provider, replaces)));
    if (key === void 0) return keyNotSaved(provider);
    await ctx.modelRegistry.authStorage.credentials.set(provider, {
      type: "api_key",
      key,
      source: "login"
    });
    return keyLine(provider, "saved, checking");
  } catch {
    return keyNotSaved(provider);
  }
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
var ROLE_NAMES = {
  small: "smol",
  middle: "middle",
  large: "slow"
};
async function checkGates(omp, pi, ctx, spawning = { agent: TASK }) {
  const batch = await openBatch(omp, pi, ctx, await readSettings(omp, ctx.cwd));
  if ("closed" in batch) return batch;
  const reason = spawnCheck(spawning, batch.facts);
  return reason === void 0 ? batch : { closed: reason };
}
async function openBatch(omp, pi, ctx, settings) {
  if (settings === void 0) return { closed: UNREADABLE };
  const routing = await findKeys(ctx, settings.provider);
  if (routing.attempts.length === 0) return { closed: KEY_UNSET };
  const config = readConfig(omp.lookup, pi.pi.settings);
  if (config === void 0) return { closed: UNREADABLE };
  const agents = await discover(pi, ctx);
  const models = slotRecord((slot) => slotModel(ctx, config.roles, slot));
  return {
    ...routing,
    facts: { ...config, scope: settings.scope, agents, models }
  };
}
function slotModel(ctx, roles, slot) {
  const name = ROLE_NAMES[slot];
  const value = Object.hasOwn(roles, name) ? roles[name] : void 0;
  const named = patternsOf(value).length > 0;
  const role = ROLE_MARK + name;
  return slotState(named ? role : void 0, named && resolves(ctx, role));
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

// src/adapters/omp/models.ts
var ROLES = "modelRoles";
var HELP = {
  small: "small_model is omp's smol role (Fast). Set it in /models under Roles, or under modelRoles.smol in config.yml.",
  middle: "middle_model is the middle role. Add it in /models under Roles with + New role\u2026 and the name middle, or under modelRoles.middle in config.yml.",
  large: "large_model is omp's slow role (Thinking). Set it in /models under Roles, or under modelRoles.slow in config.yml."
};
var OTHER_USES = {
  small: "omp also uses smol for the scout and sonic agents, commit messages, session titles and the prewalk hand-off.",
  large: "omp also uses slow for the reviewer agent and the advisor."
};
var slotName = (slot) => `${slotSetting(slot)} (${ROLE_NAMES[slot]} role)`;
function configured(omp, pi, slot) {
  let roles;
  try {
    roles = omp.lookup(ROLES)?.get(pi.pi.settings);
  } catch {
    return void 0;
  }
  const name = ROLE_NAMES[slot];
  const value = isRecord(roles) && Object.hasOwn(roles, name) ? roles[name] : void 0;
  const patterns = patternsOf(value);
  return patterns.length > 0 ? patterns.join(", ") : void 0;
}
var rate = (value) => typeof value === "number" && value !== 0;
function prices(model) {
  const { cost, pricingStatus } = model;
  if (!isRecord(cost)) return {};
  const { input, output, cacheRead, cacheWrite } = cost;
  const fixed = [input, output, cacheRead, cacheWrite].some(rate) || pricingStatus === "free";
  if (!fixed) return {};
  return {
    ...typeof input === "number" ? { input } : {},
    ...typeof output === "number" ? { output } : {}
  };
}
function listed(model) {
  if (!isRecord(model)) return [];
  const { provider, id, contextWindow } = model;
  if (typeof provider !== "string" || typeof id !== "string") return [];
  return [
    {
      id: `${provider}/${id}`,
      ...prices(model),
      ...typeof contextWindow === "number" ? { context: contextWindow } : {}
    }
  ];
}
function writer(omp, pi, ctx) {
  return {
    authorize: () => void 0,
    name: slotName,
    current: async (slot) => configured(omp, pi, slot),
    select: (slot, question, options) => {
      const note = OTHER_USES[slot];
      return ctx.ui.select(
        note === void 0 ? question : `${question} ${note}`,
        options
      );
    },
    // setEntry writes this one role into the user's global config.yml and keeps the others.
    write: async (slot, id) => {
      const roles = omp.lookup(ROLES);
      if (roles?.setEntry === void 0) throw new Error(UNREADABLE);
      roles.setEntry(pi.pi.settings, ROLE_NAMES[slot], id);
      return configured(omp, pi, slot);
    }
  };
}
var modelPort = (omp, pi, ctx) => ({
  list: async () => ctx.models.list().flatMap(listed),
  help: (slot) => HELP[slot],
  writer: ctx.hasUI ? writer(omp, pi, ctx) : null
});

// src/adapters/omp/config.ts
var COMMAND_PREFIX = "model-router:";
var LINE_BREAK2 = "\n";
var TOOL_SETTINGS = [...SETTING_NAMES, ...SLOT_SETTINGS, "models"];
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
  const settings = await readSettings(omp, ctx.cwd);
  return settings === void 0 ? UNREADABLE : show(settings);
}
var readAll = (omp, pi, ctx) => withSettings(omp, ctx, async ({ provider, scope }) => {
  const names = order(provider);
  const found = await Promise.all(names.map((name) => findKey(ctx, name)));
  const keys = {};
  names.forEach((name, i) => {
    const key = found[i];
    if (key !== void 0) keys[name] = key;
  });
  const models = SLOTS.map(
    (slot) => slotLine(slotName(slot), configured(omp, pi, slot))
  );
  return settingsReport(provider, scope, models, keys);
});
async function apply(omp, ctx, setting, value) {
  if (!isValue(setting, value)) return useOneOf(setting);
  const { plugin } = omp;
  const before = await readSettings(omp, ctx.cwd);
  if (before === void 0 || plugin === void 0)
    return unchanged(setting, UNREADABLE);
  if (before[setting] === value) return unchanged(setting, alreadyValue(value));
  try {
    await omp.writeSetting(ctx.cwd, plugin, setting, value);
  } catch (err) {
    return unchangedBy(setting, err);
  }
  const now = (await readSettings(omp, ctx.cwd))?.[setting] ?? value;
  const line = valueLine(setting, now);
  return now === value ? line : [line, projectOverrides(setting)].join(LINE_BREAK2);
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
async function runTool(omp, pi, ctx, params) {
  const { setting, candidates } = isRecord(params) ? params : {};
  if (setting === void 0) return readAll(omp, pi, ctx);
  if (isValueSetting(setting)) return dialog(omp, ctx, setting);
  if (isKeySetting(setting)) return changeKey(ctx, setting);
  const models = await runModels(modelPort(omp, pi, ctx), {
    setting,
    candidates
  });
  return models ?? badCall(TOOL_SETTINGS);
}
async function runCommand(omp, ctx, setting, args) {
  const value = args.trim();
  return value === "" ? withSettings(
    omp,
    ctx,
    (settings) => valueLine(setting, settings[setting])
  ) : apply(omp, ctx, setting, value);
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
    description: [
      toolDescription(
        TOOL_SETTINGS,
        "the provider, the scope and the three models"
      ),
      modelToolSentences(true)
    ].join(" "),
    parameters: pi.zod.object({
      setting: pi.zod.enum(TOOL_SETTINGS).optional(),
      candidates: pi.zod.array(pi.zod.string()).optional().describe(CANDIDATES_DESCRIPTION)
    }),
    loadMode: "essential",
    approval: "write",
    execute: (_id, params, _signal, _update, ctx) => serial(async () => reply(await runTool(omp, pi, ctx, params)))
  });
}

// src/core/client.ts
function createClient(provider, apiKey, model, fetchFn) {
  if (!Object.hasOwn(HOSTS, provider))
    throw new Error(`createClient: no host for ${provider}`);
  if (!apiKey)
    throw new Error(
      `createClient: no ${provider} key. Pass a non-empty key for ${provider}.`
    );
  return new TypeSafeClient({
    apiKey,
    baseURL: HOSTS[provider],
    logLevel: "off",
    defaultModel: model,
    compression: false,
    fetch: fetchFn
  });
}

// src/core/part.ts
var LEVELS = [0, 1, 2];
var fromMiddle = (down, up) => (p) => {
  const low = p[0] > down * p[1];
  const high = p[2] > up * p[1];
  if (low && high) return p[0] > p[2] ? 0 : p[2] > p[0] ? 2 : 1;
  return low ? 0 : high ? 2 : 1;
};
var PROBABILITY_DIGITS = 2;
var formatProbability = (p) => p.toFixed(PROBABILITY_DIGITS);
function parseProbabilities(answers, key) {
  const a = isRecord(answers) ? answers[key] : void 0;
  if (!isRecord(a)) return void 0;
  const { type, probabilities } = a;
  if (type !== "score" || !isRecord(probabilities)) return void 0;
  if (Object.keys(probabilities).length !== LEVELS.length) return void 0;
  const { 0: p0, 1: p1, 2: p2 } = probabilities;
  if (typeof p0 !== "number" || typeof p1 !== "number" || typeof p2 !== "number")
    return void 0;
  return { 0: p0, 1: p1, 2: p2 };
}

// src/core/compose.ts
var ROUTING_LIMIT_MS = 8e3;
var LIMIT_REACHED = /* @__PURE__ */ Symbol("routing limit reached");
var MODEL_CHARS_MAX = 40;
var isCount = (v) => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
function abortCategory(signal) {
  return signal.reason === LIMIT_REACHED ? TIMEOUT : CANCELLED;
}
function skipCategory(err, signal) {
  if (err instanceof APIUserAbortError) return abortCategory(signal);
  if (err instanceof APIError) return httpStatus(err.status);
  if (err instanceof APITimeoutError) return TIMEOUT;
  if (err instanceof APIConnectionError) return NETWORK_ERROR;
  if (err instanceof TypeSafeError) return REJECTED_REQUEST;
  return FAILED;
}
async function route(input) {
  const { parts, attempts, signal } = input;
  if (attempts.length === 0) return { skipped: KEY_UNSET };
  const failed = [];
  for (const [i, attempt2] of attempts.entries()) {
    let result;
    try {
      result = await ask3(input, attempt2);
    } catch (err) {
      failed.push({
        provider: attempt2.provider,
        reason: skipCategory(err, signal)
      });
      if (!fallsBack(err)) break;
      if (i < attempts.length - 1) input.onFallback?.(attempt2.provider);
      continue;
    }
    const decision = parseReply(parts, result);
    if ("skipped" in decision) {
      failed.push({ provider: attempt2.provider, reason: decision.skipped });
      break;
    }
    const [first] = failed;
    if (!first) return decision;
    const via = {
      provider: attempt2.provider,
      first: first.provider,
      reason: first.reason
    };
    return { ...decision, via };
  }
  return skip(failed);
}
function ask3(input, attempt2) {
  const { parts, state, keys, fetchFn, signal } = input;
  const { provider, model, ...overrides } = attempt2;
  return createClient(provider, keys[provider], model, fetchFn).systemOne(
    {
      state,
      model,
      questions: Object.fromEntries(parts.map((p) => [p.key, p.question]))
    },
    { ...overrides, signal }
  );
}
function skip(failed) {
  const [first, ...rest] = failed;
  if (!first || rest.length === 0) return { skipped: first?.reason ?? FAILED };
  return {
    skipped: failed.map((f) => `${f.provider} ${f.reason}`).join(", ")
  };
}
function parseReply(parts, result) {
  const { answers, model, usage } = isRecord(result) ? result : {};
  const decided = {};
  for (const part of parts) {
    const probabilities = parseProbabilities(answers, part.key);
    if (!probabilities) return { skipped: BAD_REPLY };
    decided[part.key] = { level: part.pick(probabilities), probabilities };
  }
  return {
    parts: decided,
    model: typeof model === "string" ? model.replace(/[^A-Za-z0-9._/-]/g, "").slice(0, MODEL_CHARS_MAX) : "",
    usage: isRecord(usage) ? usage : void 0
  };
}
function decisionSuffix({
  model,
  usage,
  via
}) {
  const input = usage?.input_tokens;
  const output = usage?.output_tokens;
  return (model ? ` \xB7 jev ${model}` : "") + (isCount(input) && isCount(output) ? ` \xB7 ${input}/${output} tok` : "") + (via ? ` \xB7 via ${via.provider} (${via.first} ${via.reason})` : "");
}

// src/core/handler-deadline.ts
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

// src/core/tier.ts
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

// src/core/work.ts
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

// src/core/decide.ts
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
    suffix: decisionSuffix(decision)
  };
}
async function scoreWork(input) {
  const decision = await route({ ...input, parts: [tier, work] });
  return decide(decision, tier.key, work.key);
}

// src/core/ladder.ts
var EFFORT_BY_TIER = {
  0: ["medium", "high", "xhigh"],
  1: ["low", "medium", "high"],
  2: ["low", "medium", "high"]
};
var effortFor = (tier2, work2) => EFFORT_BY_TIER[tier2][work2];

// src/utils/fetch.ts
var oneChunk = (bytes) => new ReadableStream({
  start(controller) {
    controller.enqueue(bytes);
    controller.close();
  }
});
var streamedFetch = async (url, init) => {
  const reply2 = await globalThis.fetch(url, init);
  const bytes = new TextEncoder().encode(await reply2.text());
  return new Response(oneChunk(bytes), {
    status: reply2.status,
    statusText: reply2.statusText,
    headers: reply2.headers
  });
};

// src/adapters/omp/score.ts
var MAX_PARALLEL = 4;
async function scoreItems(items, context, { attempts, keys, facts }, deadline) {
  const limit = new AbortController();
  if (deadline <= 0) limit.abort(LIMIT_REACHED);
  const timer = setTimeout(() => limit.abort(LIMIT_REACHED), deadline);
  const passedOver = /* @__PURE__ */ new Set();
  try {
    return await mapLimit(items, MAX_PARALLEL, async (pending) => {
      const { item, agent } = pending;
      const reason = itemCheck(agent, facts, item.model);
      if (reason !== void 0) return { ...pending, stored: skipped(reason) };
      const routing = {
        attempts: attempts.filter((a) => !passedOver.has(a.provider)),
        keys,
        onFallback: (p) => void passedOver.add(p)
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
    clearTimeout(timer);
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
    fetchFn: streamedFetch,
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
    const holders = byKey.get(key);
    holders?.delete(entry2);
    if (holders?.size === 0) byKey.delete(key);
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
      const holders = key === void 0 ? void 0 : c.byKey.get(key);
      const [entry2] = holders?.size === 1 ? holders : [];
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
    const settings = await readSettings(omp, ctx.cwd);
    const scope = settings?.scope ?? "core";
    const items = eligible.filter(({ agent }) => inScope(agent, scope));
    if (items.length === 0) return;
    const skipAll = (reason) => report(
      ctx,
      items.map(({ index }) => entry(index, skippedLine(reason)))
    );
    const budget = budgetFor(readTimeoutSetting(omp.lookup, pi.pi.settings));
    if ("closed" in budget) return skipAll(budget.closed);
    const gates = await openBatch(omp, pi, ctx, settings);
    if ("closed" in gates) return skipAll(gates.closed);
    const scored = await scoreItems(
      items,
      contextText(context),
      gates,
      budget.deadline - (Date.now() - started)
    );
    for (const { index, item, agent, stored } of scored)
      store.add(event.toolCallId, index, item.name, agent, stored);
    report(
      ctx,
      scored.map(({ index, stored }) => entry(index, stored.line))
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
