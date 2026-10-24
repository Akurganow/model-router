// src/omp.ts
import { lookup } from "@oh-my-pi/pi-coding-agent/config/registry";
import { getPluginSettings } from "@oh-my-pi/pi-coding-agent/extensibility/plugins/loader";
import { getPluginsLockfile } from "@oh-my-pi/pi-utils";

// src/brief.ts
var BUDGET_CHARS = 12e3;
var ROLE_CAP = 500;
var NO_DESCRIPTION = "An agent with no description.";
var OMISSION_MARKER = "\n[middle of the brief omitted]\n";
var HEAD_SHARE = 2 / 3;
var CONTEXT_CAP_CHARS = 3e3;
var CONTEXT_MIN_CHARS = 500;
var CONTEXT_LABEL = "\n\nBatch context:\n";
var REDACT_PATTERNS = [
  [/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer ***"],
  [/\bsk-[A-Za-z0-9_-]{8,}/g, "***"],
  [
    /\b([A-Za-z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD))(["']?\s*[=:]\s*)(?:"[^"]*"?|'[^']*'?|[^\s"']+)/gi,
    "$1$2***"
  ]
];
function prepareBrief(text, budget = BUDGET_CHARS) {
  const condensed = condense(redact(text));
  if (condensed.length <= budget) return condensed;
  const kept = budget - OMISSION_MARKER.length;
  const head = Math.floor(kept * HEAD_SHARE);
  const tail = kept - head;
  return `${condensed.slice(0, head)}${OMISSION_MARKER}${condensed.slice(condensed.length - tail)}`;
}
function condense(text) {
  return text.replace(/```[^\n]*\n([\s\S]*?)```/g, (_, block) => {
    const lines = block.replace(/\n$/, "").split("\n").length;
    return `[an exact block of ${lines} lines is given verbatim]`;
  }).replace(/\n{3,}/g, "\n\n");
}
function redact(text) {
  return REDACT_PATTERNS.reduce(
    (t, [pattern, replacement]) => t.replace(pattern, replacement),
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
  return typeof context === "string" && context.trim() !== "" ? context : "";
}
function roleText(description) {
  if (typeof description !== "string") return NO_DESCRIPTION;
  const text = redact(description).replace(/\s+/g, " ").trim();
  if (text === "") return NO_DESCRIPTION;
  const cut = text.slice(0, ROLE_CAP);
  return /[\uD800-\uDBFF]$/.test(cut) && text.length > ROLE_CAP ? cut.slice(0, -1) : cut;
}

// src/omp-gates.ts
import { readFile } from "node:fs/promises";

// src/omp-items.ts
var TASK = "task";
var BUNDLED = "bundled";
var ROLE_MARK = "@";
var SEANCE = "seance";
var CUSTOM_AGENT = "custom task agent";
var isEmpty = (v) => v === void 0 || v === null || typeof v === "string" && v.trim() === "";
var inScope = (name, scope) => scope === "extended" || name === TASK;
var findAgent = (name, { agents }) => agents?.find((agent) => agent.name === name);
var ownRole = (agent) => agent?.model?.find((model) => model.startsWith(ROLE_MARK))?.slice(ROLE_MARK.length);
function userChoice(name, facts) {
  if (name === TASK && !isEmpty(facts.roles[TASK]))
    return "task model role set";
  if (Object.hasOwn(facts.overrides, name) && !isEmpty(facts.overrides[name]))
    return `${name} model override set`;
  if (facts.disabled.includes(name)) return `${name} agent disabled`;
  return void 0;
}
function agentGate(name, facts) {
  const found = findAgent(name, facts);
  if (found?.source === BUNDLED) return void 0;
  if (facts.scope === "core") return CUSTOM_AGENT;
  if (facts.agents === void 0) return `${name} agent discovery failed`;
  if (found === void 0) return `${name} agent unknown`;
  return found.model?.length ? `${name} sets its own model` : void 0;
}
var seanceGate = (name) => name === SEANCE ? `${name} spawns without the hook omp gives plugins, so its model cannot change` : void 0;
function itemCheck(name, facts) {
  if (!inScope(name, facts.scope)) return `${name} is outside the core scope`;
  return userChoice(name, facts) ?? seanceGate(name) ?? agentGate(name, facts) ?? facts.noModels;
}
function spawnCheck({ agent, modelRole }, facts) {
  const reason = itemCheck(agent, facts);
  if (reason !== void 0) return reason;
  return modelRole && modelRole !== ownRole(findAgent(agent, facts)) ? `${agent} spawns with another model role` : void 0;
}
var roleOf = (name, facts) => roleText(findAgent(name, facts)?.description);

// src/part.ts
var LEVELS = [0, 1, 2];
var PROBABILITY_DIGITS = 2;
var formatProbability = (p) => p.toFixed(PROBABILITY_DIGITS);
var isRecord = (v) => typeof v === "object" && v !== null;
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
  const { error, message, detail } = body;
  if (typeof error === "string") return error;
  if (isRecord2(error) && typeof error.message === "string") return error.message;
  if (typeof message === "string") return message;
  if (typeof detail === "string") return detail;
  if (isRecord2(detail) && typeof detail.message === "string") return detail.message;
  if (Array.isArray(detail)) return describeValidationErrors(detail);
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
    const detail = extractMessage(body);
    if (detail) return `${status} ${detail}`;
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
  const known = new Map(Object.values(assets).map((asset) => [String(asset), asset]));
  const json = JSON.stringify(payload, function(key, value) {
    if (typeof value === "number" && !Number.isFinite(value)) return String(value);
    const original = this[key];
    if (typeof original !== "object" || original === null) return value;
    if (isImage(original)) {
      const name = names.get(original);
      if (name !== void 0) return name;
      known.set(String(original), original);
    } else if (isTextWithAssets(original)) {
      let text = original.text;
      for (const asset of original.assets) {
        const name = names.get(asset);
        if (name === void 0) known.set(String(asset), asset);
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
    const asset = known.get(reference);
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

// src/provider.ts
var PROVIDER_VALUES = [
  "auto",
  "openrouter-first",
  "typesafe",
  "openrouter"
];
var HOSTS = {
  typesafe: "https://api.typesafe.ai",
  openrouter: "https://openrouter.ai/api"
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
  auto: ["typesafe", "openrouter"],
  "openrouter-first": ["openrouter", "typesafe"],
  typesafe: ["typesafe"],
  openrouter: ["openrouter"]
};
var NARROWABLE = ["auto", "openrouter-first"];
var resolve = (value) => typeof value === "string" && Object.hasOwn(ORDER, value) ? value : DEFAULT_VALUE;
var order = (value) => ORDER[resolve(value)];
function plan(value, present) {
  const providers = order(value).filter((p) => present[p]);
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
function narrow(global, project) {
  const value = resolve(global);
  return NARROWABLE.includes(value) && (project === "typesafe" || project === "openrouter") ? project : value;
}

// src/scope.ts
var SCOPE_VALUES = ["core", "extended"];
var DEFAULT_SCOPE = "core";
var resolveScope = (value) => SCOPE_VALUES.find((known) => known === value) ?? DEFAULT_SCOPE;

// src/omp-gates.ts
var ROLES = { small: "@smol", large: "@slow" };
var UNREADABLE = "settings unreadable";
var PLUGIN = "model-router-omp";
var KEY_VARIABLES = {
  typesafe: "TYPESAFE_API_KEY",
  openrouter: "OPENROUTER_API_KEY"
};
async function checkGates(omp, pi, ctx, spawning = { agent: TASK }) {
  const batch = await openBatch(omp, pi, ctx, await readSettings(omp, ctx.cwd));
  if ("closed" in batch) return batch;
  const reason = spawnCheck(spawning, batch.facts);
  return reason === void 0 ? { attempts: batch.attempts, keys: batch.keys } : { closed: reason };
}
async function openBatch(omp, pi, ctx, settings) {
  if (settings === void 0) return { closed: UNREADABLE };
  const routing = await findKeys(ctx, settings.provider);
  if (routing.attempts.length === 0) return { closed: "key unset" };
  const config = readConfig(omp.lookup, pi.pi.settings);
  if (config === void 0) return { closed: UNREADABLE };
  const agents = await discover(pi, ctx);
  const noModels = modelsGate(ctx);
  return {
    ...routing,
    facts: { ...config, scope: settings.scope, agents, noModels }
  };
}
async function readSettings(omp, cwd) {
  try {
    const [global, effective] = await Promise.all([
      readGlobal(omp.getPluginsLockfile()),
      omp.getPluginSettings(PLUGIN, cwd)
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
async function readGlobal(path) {
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
  const mine = isRecord(settings) ? settings[PLUGIN] : void 0;
  return isRecord(mine) ? mine : {};
}
async function findKeys(ctx, value) {
  const keys = {};
  for (const provider of order(value)) {
    const key = await findKey(ctx, provider);
    if (key !== void 0) keys[provider] = key;
  }
  const present = {
    typesafe: keys.typesafe !== void 0,
    openrouter: keys.openrouter !== void 0
  };
  return { attempts: plan(value, present), keys };
}
async function findKey(ctx, provider) {
  try {
    const key = await ctx.modelRegistry.getApiKeyForProvider(provider);
    if (typeof key === "string" && key !== "") return key;
  } catch {
  }
  return process.env[KEY_VARIABLES[provider]] || void 0;
}
function resolves(ctx, role) {
  try {
    return ctx.models.resolve(role) !== void 0;
  } catch {
    return false;
  }
}
function read(lookup2, id, settings) {
  try {
    return lookup2(id)?.get(settings);
  } catch {
    return void 0;
  }
}
function readConfig(lookup2, settings) {
  const roles = read(lookup2, "modelRoles", settings);
  const overrides = read(lookup2, "task.agentModelOverrides", settings);
  const disabled = read(lookup2, "task.disabledAgents", settings);
  return isRecord(roles) && isRecord(overrides) && Array.isArray(disabled) ? { roles, overrides, disabled } : void 0;
}
async function discover(pi, ctx) {
  try {
    return (await pi.pi.discoverAgents(ctx.cwd)).agents;
  } catch {
    return void 0;
  }
}
function modelsGate(ctx) {
  return Object.values(ROLES).some((role) => resolves(ctx, role)) ? void 0 : `no ${ROLES.small} or ${ROLES.large} model`;
}

// src/settings.ts
var VALUE_SETTINGS = ["provider", "scope"];
var KEY_SETTINGS = ["typesafe_key", "openrouter_key"];
var SETTING_NAMES = [...VALUE_SETTINGS, ...KEY_SETTINGS];
var KEY_PROVIDERS = {
  typesafe_key: "typesafe",
  openrouter_key: "openrouter"
};
var PROVIDER_NAMES = {
  typesafe: "TypeSafe",
  openrouter: "OpenRouter"
};
var KEY_MAX_LENGTH = 512;
var PADDED_LABELS = ["Yes", "No"];
var LINE_BREAK = /[\r\n\u2028\u2029]/;
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
var isValueSetting = (name) => VALUE_SETTINGS.some((known) => known === name);
var isKeySetting = (name) => KEY_SETTINGS.some((known) => known === name);
var keyProvider = (setting) => KEY_PROVIDERS[setting];
var isValue = (setting, value) => TEXTS[setting].values.some((known) => known === value);
var valueLine = (setting, value) => setting === "provider" ? `provider: ${value} (${order(value).join(", then ")})` : `scope: ${resolveScope(value)}`;
var useOneOf = (setting) => `${setting}: use one of ${TEXTS[setting].values.join(", ")}`;
var unchanged = (setting, reason) => `${setting} unchanged: ${reason}`;
var alreadyValue = (value) => `already ${value}`;
var projectOverrides = (setting) => `A project value for ${setting} overrides it.`;
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
function keyFrom(answer) {
  if (typeof answer !== "string" || LINE_BREAK.test(answer)) return void 0;
  const key = answer.trim();
  return key === "" || key.length > KEY_MAX_LENGTH || PADDED_LABELS.includes(key) ? void 0 : key;
}
var keyQuestion = (provider, replaces) => `Enter your ${PROVIDER_NAMES[provider]} API key. It goes to the harness's credential store.${replaces ? " It replaces the key that is set now." : ""}`;
var toolDescription = (names) => `Reads the router's settings. With no input it returns the provider and scope, and whether each key the provider allows is set. With a setting name (${names.join(", ")}) the plugin asks the person in its own dialog and writes their choice. Never pass a value or a key: the person supplies them in the dialog.`;
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

// src/omp-key.ts
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

// src/omp-config.ts
var COMMAND_PREFIX = "model-router:";
var TOOL_NAME = "model_router_config";
var LINE_BREAK2 = "\n";
function say(ctx, text) {
  try {
    if (ctx.hasUI) ctx.ui.notify(text);
    else process.stderr.write(`${text}
`);
  } catch {
  }
}
function serializer() {
  let tail = Promise.resolve();
  return (job) => {
    const run = tail.then(job);
    tail = run.catch(() => void 0);
    return run;
  };
}
async function withSettings(omp, ctx, show) {
  const settings = await readSettings(omp, ctx.cwd);
  return settings === void 0 ? UNREADABLE : show(settings);
}
var readAll = (omp, ctx) => withSettings(omp, ctx, async ({ provider, scope }) => {
  const keys = await Promise.all(
    order(provider).map(
      async (name) => keyLine(
        name,
        await findKey(ctx, name) === void 0 ? "unset" : "set"
      )
    )
  );
  return [
    valueLine("provider", provider),
    valueLine("scope", scope),
    ...keys
  ].join(LINE_BREAK2);
});
async function apply(omp, ctx, setting, value) {
  if (!isValue(setting, value)) return useOneOf(setting);
  const before = await readSettings(omp, ctx.cwd);
  if (before === void 0) return unchanged(setting, UNREADABLE);
  if (before[setting] === value) return unchanged(setting, alreadyValue(value));
  try {
    await omp.writeSetting(ctx.cwd, PLUGIN, setting, value);
  } catch (err) {
    return unchanged(setting, err instanceof Error ? err.message : String(err));
  }
  const now = (await readSettings(omp, ctx.cwd))?.[setting] ?? value;
  const line = valueLine(setting, now);
  return now === value ? line : [line, projectOverrides(setting)].join(LINE_BREAK2);
}
async function select(ctx, question, options) {
  try {
    return await ctx.ui.select(question, options);
  } catch {
    return void 0;
  }
}
async function dialog(omp, ctx, setting) {
  if (!ctx.hasUI) return unchanged(setting, NO_ANSWER);
  const shown = await readSettings(omp, ctx.cwd);
  const { question, options } = ask(setting, shown?.[setting]);
  const answer = await select(ctx, question, options);
  if (answer === void 0) return unchanged(setting, NO_ANSWER);
  const value = pick(setting, answer);
  return value === void 0 ? unchanged(setting, NOT_OFFERED) : apply(omp, ctx, setting, value);
}
async function runTool(omp, ctx, params) {
  const { setting } = isRecord(params) ? params : {};
  if (setting === void 0) return readAll(omp, ctx);
  if (isValueSetting(setting)) return dialog(omp, ctx, setting);
  return isKeySetting(setting) ? changeKey(ctx, setting) : badCall(SETTING_NAMES);
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
    description: toolDescription(SETTING_NAMES),
    parameters: pi.zod.object({
      setting: pi.zod.enum(SETTING_NAMES).optional()
    }),
    loadMode: "essential",
    approval: "write",
    execute: (_id, params, _signal, _update, ctx) => serial(async () => reply(await runTool(omp, ctx, params)))
  });
}

// src/client.ts
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

// src/compose.ts
var ROUTING_LIMIT_MS = 8e3;
var LIMIT_REACHED = /* @__PURE__ */ Symbol("routing limit reached");
var MODEL_CHARS_MAX = 40;
var isCount = (v) => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
function skipCategory(err, signal) {
  if (err instanceof APIUserAbortError)
    return signal.reason === LIMIT_REACHED ? "timeout" : "cancelled";
  if (err instanceof APIError) return `HTTP ${err.status}`;
  if (err instanceof APITimeoutError) return "timeout";
  if (err instanceof APIConnectionError) return "network error";
  if (err instanceof TypeSafeError) return "rejected request";
  return "failed";
}
async function route(input) {
  const { parts, attempts, signal } = input;
  if (attempts.length === 0) return { skipped: "key unset" };
  const failed = [];
  for (const [i, attempt2] of attempts.entries()) {
    let result;
    try {
      result = await ask2(input, attempt2);
    } catch (err) {
      failed.push({
        provider: attempt2.provider,
        reason: skipCategory(err, signal)
      });
      if (!fallsBack(err)) break;
      if (i < attempts.length - 1) input.onFallback?.(attempt2.provider);
      continue;
    }
    const decision = decide(parts, result);
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
function ask2(input, attempt2) {
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
  if (!first || rest.length === 0)
    return { skipped: first?.reason ?? "failed" };
  return {
    skipped: failed.map((f) => `${f.provider} ${f.reason}`).join(", ")
  };
}
function decide(parts, result) {
  const { answers, model, usage } = isRecord(result) ? result : {};
  const decided = {};
  for (const part of parts) {
    const probabilities = parseProbabilities(answers, part.key);
    if (!probabilities) return { skipped: "bad reply" };
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

// src/model.ts
var TIE_MARGIN = 0.1;
var TIER_INSTRUCTIONS = "How much judgment does completing `task` require from an agent whose role is `role`? `description` is the caller's one-line summary of the task.";
var TIER_TEXTS = [
  "Lookup or transcription: the brief names the exact files to read or string to find, or holds the exact code, config or prose to write. It gives the commands to run and the check that proves the work done. No choice is left.",
  "Bounded judgment: the brief fixes the goal and a way to check the result. Check work against stated requirements, fix named defects, implement from a given plan or spec, or answer a question from a few named files.",
  "Open judgment: the brief leaves the approach open. Decide a design, create content with no plan or spec to follow, review a multi-file change for risks no checklist names, or debug with an unclear cause."
];
function pickTier(p) {
  const best = LEVELS.reduce((a, b) => p[b] > p[a] ? b : a);
  for (const i of [2, 1])
    if (i > best && p[best] - p[i] < TIE_MARGIN) return i;
  return best;
}
var tier = {
  key: "tier",
  question: {
    type: "score",
    instructions: TIER_INSTRUCTIONS,
    criteria: TIER_TEXTS
  },
  pick: pickTier
};

// src/omp-score.ts
var MAX_PARALLEL = 4;
var ROLE_BY_LEVEL = {
  0: ROLES.small,
  1: void 0,
  2: ROLES.large
};
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
async function scoreItems(items, context, { attempts, keys, facts }) {
  const limit = new AbortController();
  const timer = setTimeout(() => limit.abort(LIMIT_REACHED), ROUTING_LIMIT_MS);
  const passedOver = /* @__PURE__ */ new Set();
  try {
    return await mapLimit(items, MAX_PARALLEL, async (pending) => {
      const { item, agent } = pending;
      const reason = itemCheck(agent, facts);
      if (reason !== void 0) return { ...pending, stored: skipped(reason) };
      const routing = {
        attempts: attempts.filter((a) => !passedOver.has(a.provider)),
        keys,
        onFallback: (p) => void passedOver.add(p)
      };
      const decision = await scoreItem(
        item,
        context,
        roleOf(agent, facts),
        routing,
        limit.signal
      );
      return { ...pending, stored: toStored(decision) };
    });
  } finally {
    clearTimeout(timer);
  }
}
function scoreItem(item, context, role, routing, signal) {
  return route({
    parts: [tier],
    state: {
      role,
      description: typeof item.name === "string" ? item.name : "",
      task: buildPrompt(item.task, context)
    },
    ...routing,
    fetchFn: streamedFetch,
    signal
  });
}
var skipped = (reason) => ({
  role: void 0,
  line: `skipped, ${reason}`
});
function toStored(decision) {
  if ("skipped" in decision) return skipped(decision.skipped);
  const part = decision.parts[tier.key];
  if (!part) return skipped("bad reply");
  const role = ROLE_BY_LEVEL[part.level];
  const p = formatProbability(part.probabilities[part.level]);
  return {
    role,
    line: `L${part.level} ${role ?? "no change"} \xB7 p=${p}${decisionSuffix(decision)}`
  };
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

// src/omp-store.ts
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
      if (typeof name === "string" && name.trim() !== "") link(c, entry2, name);
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
      return entry2.stored;
    }
  };
}

// src/omp-router.ts
var LINE_PREFIX = "model-router ";
var ENTRY_SEPARATOR = " | ";
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
    const gates = await openBatch(omp, pi, ctx, settings);
    if ("closed" in gates) {
      const line = `skipped, ${gates.closed}`;
      return report(
        ctx,
        items.map(({ index }) => entry(index, line))
      );
    }
    const scored = await scoreItems(items, contextText(context), gates);
    for (const { index, item, agent, stored } of scored)
      store.add(event.toolCallId, index, item.name, agent, stored);
    report(
      ctx,
      scored.map(({ index, stored }) => entry(index, stored.line))
    );
  }
  async function onSpawn(event, ctx) {
    if (event.invocationKind !== TASK) return;
    const stored = store.take(event.spawnKey, event.agent);
    if (!stored?.role) return;
    if ("closed" in await checkGates(omp, pi, ctx, event)) return;
    if (!resolves(ctx, stored.role)) return;
    return { model: stored.role, note: LINE_PREFIX + stored.line };
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

// src/omp.ts
async function writeSetting(cwd, plugin, key, value) {
  const { PluginManager } = await import("@oh-my-pi/pi-coding-agent/extensibility/plugins/manager");
  await new PluginManager(cwd).setPluginSetting(plugin, key, value);
}
var omp_default = createExtension({
  lookup,
  getPluginsLockfile,
  getPluginSettings,
  writeSetting
});
export {
  omp_default as default
};
