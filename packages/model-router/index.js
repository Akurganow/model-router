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
var retryDelayMs = (attempt, headers, policy = DEFAULT_RETRY_POLICY, random = Math.random) => {
  if (policy.respectRetryAfter && headers !== void 0) {
    const retryAfter = parseRetryAfter(headers);
    if (retryAfter !== void 0 && retryAfter <= policy.maxRetryAfterMs) return retryAfter;
  }
  const exponential = Math.min(policy.backoffInitialMs * 2 ** attempt, policy.backoffMaxMs);
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
var isRecord = (value) => typeof value === "object" && value !== null;
var extractMessage = (body) => {
  if (typeof body === "string") return body || void 0;
  if (!isRecord(body)) return void 0;
  const { error, message, detail } = body;
  if (typeof error === "string") return error;
  if (isRecord(error) && typeof error.message === "string") return error.message;
  if (typeof message === "string") return message;
  if (typeof detail === "string") return detail;
  if (isRecord(detail) && typeof detail.message === "string") return detail.message;
  if (Array.isArray(detail)) return describeValidationErrors(detail);
};
var describeValidationErrors = (errors) => {
  const parts = errors.flatMap((e) => {
    if (!isRecord(e) || typeof e.msg !== "string") return [];
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
  const read = await Promise.all(Object.entries(assets).map(async ([alias, asset]) => [
    alias,
    asset,
    await readImage(alias, asset)
  ]));
  const parts = [];
  const entries = [];
  for (const [alias, { type }, data] of read) {
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
  const enabled = (at2) => RANK[at2] >= RANK[level];
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
var redact = (name, value) => {
  const lower = name.toLowerCase();
  if (KEY_HEADERS.has(lower)) return redactKey(value);
  if (OPAQUE_HEADERS.has(lower)) return "***";
  return value;
};
var redactHeaders = (headers) => Object.fromEntries(Object.entries(headers).map(([name, value]) => [name, redact(name, value)]));
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
var mergeHeaders = (...sources2) => {
  const entries = /* @__PURE__ */ new Map();
  for (const source of sources2) for (const [name, value] of Object.entries(source)) if (value === void 0) entries.delete(name.toLowerCase());
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
    for (let attempt = 0; ; attempt++) {
      const retriesLeft = req.retry.maxRetries - attempt;
      const attemptHeaders = attempt === 0 ? headers : {
        ...headers,
        "X-TypeSafe-Retry-Count": String(attempt)
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
        await this.backOff(tag, attempt, retriesLeft, err.message, void 0, req);
        continue;
      }
      const requestId = requestIdFrom(res.headers);
      this.logger.info(`${tag} <- ${res.status} in ${Date.now() - started}ms${requestId ? ` (request ${requestId})` : ""}`);
      if (res.ok) return res;
      const errorBody = await parseBody(res);
      this.logger.debug(`${tag} <- error body`, errorBody);
      const error = APIError.fromResponse(res.status, errorBody, res.headers);
      if (retriesLeft <= 0 || !isRetryableStatus(res.status, req.retry)) throw error;
      await this.backOff(tag, attempt, retriesLeft, `${res.status}`, res.headers, req);
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
  async backOff(tag, attempt, retriesLeft, reason, headers, { retry, signal }) {
    const delay = retryDelayMs(attempt, headers, retry);
    const nth = attempt + 1;
    const total = attempt + retriesLeft;
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
  auto: ["typesafe", "openrouter"],
  "openrouter-first": ["openrouter", "typesafe"],
  typesafe: ["typesafe"],
  openrouter: ["openrouter"]
};
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

// src/part.ts
var LEVELS = [0, 1, 2];
var fromMiddle = (down, up) => (p) => {
  const low = p[0] > down * p[1];
  const high = p[2] > up * p[1];
  if (low && high) return p[0] > p[2] ? 0 : p[2] > p[0] ? 2 : 1;
  return low ? 0 : high ? 2 : 1;
};
var PROBABILITY_DIGITS = 2;
var formatProbability = (p) => p.toFixed(PROBABILITY_DIGITS);
var nonEmpty = (value) => {
  const text = typeof value === "string" ? value.trim() : "";
  return text === "" ? void 0 : text;
};
var isRecord2 = (v) => typeof v === "object" && v !== null;
function parseProbabilities(answers, key) {
  const a = isRecord2(answers) ? answers[key] : void 0;
  if (!isRecord2(a)) return void 0;
  const { type, probabilities } = a;
  if (type !== "score" || !isRecord2(probabilities)) return void 0;
  if (Object.keys(probabilities).length !== LEVELS.length) return void 0;
  const { 0: p0, 1: p1, 2: p2 } = probabilities;
  if (typeof p0 !== "number" || typeof p1 !== "number" || typeof p2 !== "number")
    return void 0;
  return { 0: p0, 1: p1, 2: p2 };
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
  for (const [i, attempt] of attempts.entries()) {
    let result;
    try {
      result = await ask(input, attempt);
    } catch (err) {
      failed.push({
        provider: attempt.provider,
        reason: skipCategory(err, signal)
      });
      if (!fallsBack(err)) break;
      if (i < attempts.length - 1) input.onFallback?.(attempt.provider);
      continue;
    }
    const decision = decide(parts, result);
    if ("skipped" in decision) {
      failed.push({ provider: attempt.provider, reason: decision.skipped });
      break;
    }
    const [first] = failed;
    if (!first) return decision;
    const via = {
      provider: attempt.provider,
      first: first.provider,
      reason: first.reason
    };
    return { ...decision, via };
  }
  return skip(failed);
}
function ask(input, attempt) {
  const { parts, state, keys, fetchFn, signal } = input;
  const { provider, model, ...overrides } = attempt;
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
  const { answers, model, usage } = isRecord2(result) ? result : {};
  const decided = {};
  for (const part of parts) {
    const probabilities = parseProbabilities(answers, part.key);
    if (!probabilities) return { skipped: "bad reply" };
    decided[part.key] = { level: part.pick(probabilities), probabilities };
  }
  return {
    parts: decided,
    model: typeof model === "string" ? model.replace(/[^A-Za-z0-9._/-]/g, "").slice(0, MODEL_CHARS_MAX) : "",
    usage: isRecord2(usage) ? usage : void 0
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

// src/fetch.ts
var oneChunk = (bytes) => new ReadableStream({
  start(controller) {
    controller.enqueue(bytes);
    controller.close();
  }
});
var streamedFetch = async (url, init) => {
  const reply = await globalThis.fetch(url, init);
  const bytes = new TextEncoder().encode(await reply.text());
  return new Response(oneChunk(bytes), {
    status: reply.status,
    statusText: reply.statusText,
    headers: reply.headers
  });
};

// src/scope.ts
var SCOPE_VALUES = ["core", "extended"];
var DEFAULT_SCOPE = "core";
var resolveScope = (value) => SCOPE_VALUES.find((known) => known === value) ?? DEFAULT_SCOPE;

// src/openclaw-settings.ts
var PLUGIN_ID = "model-router-openclaw";
var KEY_FIELDS = {
  typesafe: "api_key",
  openrouter: "openrouter_api_key"
};
function sources(live, pluginConfig) {
  const entry = live?.plugins?.entries?.[PLUGIN_ID]?.config;
  return [entry, pluginConfig].filter(isRecord2);
}
var firstValid = (from, field, valid) => from.map((settings) => settings[field]).find(valid);
var oneOf = (allowed) => (value) => allowed.includes(value);
var isProvider = oneOf(PROVIDER_VALUES);
var isScope = oneOf(SCOPE_VALUES);
var isText = (value) => nonEmpty(value) !== void 0;
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
    provider: resolve(firstValid(from, "provider", isProvider)),
    scope: resolveScope(firstValid(from, "scope", isScope)),
    smallModel: nonEmpty(firstValid(from, "small_model", isText)),
    largeModel: nonEmpty(firstValid(from, "large_model", isText))
  };
}
function readKeys(live, pluginConfig, providerValue, env) {
  const from = sources(live, pluginConfig);
  const keys = {};
  for (const provider of order(providerValue)) {
    const key = from.map((s) => nonEmpty(s[KEY_FIELDS[provider]])).find(Boolean) ?? nonEmpty(env[KEY_VARIABLES[provider]]);
    if (key !== void 0) keys[provider] = key;
  }
  return keys;
}

// src/settings.ts
var VALUE_SETTINGS = ["provider", "scope"];
var KEY_SETTINGS = ["typesafe_key", "openrouter_key"];
var SETTING_NAMES = [...VALUE_SETTINGS, ...KEY_SETTINGS];
var KEY_PROVIDERS = {
  typesafe_key: "typesafe",
  openrouter_key: "openrouter"
};
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
var UNREADABLE = "settings unreadable";
var keyLine = (provider, state) => `${provider} key: ${state}`;
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

// src/openclaw-config.ts
var TOOL_NAME = "model_router_config";
var COMMAND_PREFIX = "model-router-";
var commandName = (setting) => `${COMMAND_PREFIX}${setting}`;
var COMMAND_NAMES = VALUE_SETTINGS.map(commandName);
var ADMIN_SCOPE = "operator.admin";
var LINE_BREAK = "\n";
var UNSET = "unset";
var NOT_OWNER = `only the owner with the ${ADMIN_SCOPE} scope can change it`;
var TOOL_DESCRIPTION = `Reads the router's settings. With no input it returns the provider, the scope, both models, and whether each key the provider allows is set. With a setting name (${SETTING_NAMES.join(", ")}) it returns how the person changes that setting. It changes nothing and never returns a key.`;
function snapshot(api, env) {
  const live = readLive(api);
  const settings = readSettings(live, api.pluginConfig);
  return {
    settings,
    keys: readKeys(live, api.pluginConfig, settings.provider, env)
  };
}
var modelLine = (name, model) => `${name}: ${model ?? UNSET}`;
function keyLines(providers, keys) {
  return providers.map(
    (name) => keyLine(name, keys[name] === void 0 ? UNSET : "set")
  );
}
function readAll({ settings, keys }) {
  return [
    valueLine("provider", settings.provider),
    valueLine("scope", settings.scope),
    modelLine("small_model", settings.smallModel),
    modelLine("large_model", settings.largeModel),
    ...keyLines(order(settings.provider), keys)
  ].join(LINE_BREAK);
}
function howToChange(setting) {
  if (isValueSetting(setting))
    return [
      `Type /${commandName(setting)} <value> in the chat.`,
      useOneOf(setting)
    ].join(LINE_BREAK);
  return isKeySetting(setting) ? `Enter the ${keyProvider(setting)} key in the plugin's settings. Never type a key into the chat.` : badCall(SETTING_NAMES);
}
function runTool(api, env, params) {
  const { setting } = isRecord2(params) ? params : {};
  return setting === void 0 ? readAll(snapshot(api, env)) : howToChange(setting);
}
var isOwner = (ctx) => ctx.senderIsOwner === true;
function store(draft, setting, value) {
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
async function write(api, ctx, setting, value) {
  try {
    await api.runtime.config.mutateConfigFile({
      afterWrite: { mode: "auto" },
      ...ctx.assertOwnerCurrent ? { writeOptions: { assertCurrent: ctx.assertOwnerCurrent } } : {},
      mutate: (draft) => store(draft, setting, value)
    });
    return valueLine(setting, value);
  } catch (err) {
    return unchanged(setting, err instanceof Error ? err.message : String(err));
  }
}
async function runCommand(api, env, ctx, setting) {
  const value = (ctx.args ?? "").trim();
  const current = snapshot(api, env).settings[setting];
  if (value === "") return valueLine(setting, current);
  if (!isValue(setting, value)) return useOneOf(setting);
  if (!isOwner(ctx))
    return [unchanged(setting, NOT_OWNER), valueLine(setting, current)].join(
      LINE_BREAK
    );
  if (current === value) return unchanged(setting, alreadyValue(value));
  return write(api, ctx, setting, value);
}
var textOf = (text) => ({
  content: [{ type: "text", text }]
});
function failure(err) {
  return `error: ${err instanceof Error ? err.message : String(err)}`;
}
function registerConfig(api, env) {
  api.registerTool({
    name: TOOL_NAME,
    label: TOOL_LABEL,
    description: TOOL_DESCRIPTION,
    parameters: {
      type: "object",
      properties: { setting: { type: "string", enum: SETTING_NAMES } },
      additionalProperties: false
    },
    execute: async (_id, params) => {
      try {
        return textOf(runTool(api, env, params));
      } catch (err) {
        return textOf(failure(err));
      }
    }
  });
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

// src/brief.ts
var BUDGET_CHARS = 12e3;
var ROLE_CAP = 500;
var NO_DESCRIPTION = "An agent with no description.";
var DEFAULT_ROLE = "General-purpose agent for researching complex questions, searching for code, and executing multi-step tasks. When you are searching for a keyword or file and are not confident that you will find the right match in the first few tries use this agent to perform the search for you.";
var OMISSION_MARKER = "\n[middle of the brief omitted]\n";
var HEAD_SHARE = 2 / 3;
var REDACT_PATTERNS = [
  [/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer ***"],
  [/\bsk-[A-Za-z0-9_-]{8,}/g, "***"],
  [
    /\b([A-Za-z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD))(["']?\s*[=:]\s*)(?:"[^"]*"?|'[^']*'?|[^\s"']+)/gi,
    "$1$2***"
  ]
];
function prepareBrief(text, budget = BUDGET_CHARS) {
  const condensed = condense(redact2(text));
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
function redact2(text) {
  return REDACT_PATTERNS.reduce(
    (t, [pattern, replacement]) => t.replace(pattern, replacement),
    text
  );
}
function roleText(description) {
  if (typeof description !== "string") return NO_DESCRIPTION;
  const text = redact2(description).replace(/\s+/g, " ").trim();
  if (text === "") return NO_DESCRIPTION;
  const cut = text.slice(0, ROLE_CAP);
  return /[\uD800-\uDBFF]$/.test(cut) && text.length > ROLE_CAP ? cut.slice(0, -1) : cut;
}

// src/decide.ts
var BAD_REPLY = { skipped: "bad reply" };
var levelOf = (decision, key) => {
  const part = decision.parts[key];
  return part && {
    level: part.level,
    probability: formatProbability(part.probabilities[part.level])
  };
};
function decide2(decision, tierKey, workKey) {
  if ("skipped" in decision) return decision;
  const tier2 = levelOf(decision, tierKey);
  if (!tier2) return BAD_REPLY;
  const suffix = decisionSuffix(decision);
  if (workKey === void 0)
    return { tier: tier2.level, probabilities: tier2.probability, suffix };
  const work2 = levelOf(decision, workKey);
  if (!work2) return BAD_REPLY;
  return {
    tier: tier2.level,
    work: work2.level,
    probabilities: `${tier2.probability}/${work2.probability}`,
    suffix
  };
}

// src/effort.ts
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

// src/ladder.ts
var EFFORT_BY_TIER = {
  0: ["medium", "high", "xhigh"],
  1: ["low", "medium", "high"],
  2: ["low", "medium", "high"]
};
var effortFor = (tier2, work2) => EFFORT_BY_TIER[tier2][work2];

// src/line.ts
var NO_CHANGE = "no change";
function routedLine({
  level,
  target,
  effort,
  probabilities,
  suffix
}) {
  const effortSegment = effort === void 0 ? "" : ` \xB7 ${effort}`;
  return `L${level} ${target ?? NO_CHANGE}${effortSegment} \xB7 p=${probabilities}${suffix}`;
}
var skippedLine = (reason) => `skipped, ${reason}`;

// src/model.ts
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

// src/openclaw-checks.ts
async function slotResolves(runtime, cfg, agentId, slot) {
  try {
    const target = agentId === void 0 ? { cfg } : { cfg, agentId };
    const { modelConfig, modelAuth, agent } = runtime;
    const { provider: defaultProvider } = modelConfig.resolveDefaultModelForAgent(target);
    const resolved = modelConfig.resolveAllowedModelRef({
      ...target,
      catalog: [],
      raw: slot,
      defaultProvider
    });
    if ("error" in resolved) return false;
    const agentDir = agentId === void 0 ? void 0 : agent.resolveAgentDir(cfg, agentId);
    const credential = {
      provider: resolved.ref.provider,
      cfg,
      ...agentDir ? { agentDir } : {}
    };
    return await modelAuth.isProviderApiKeyConfiguredAsync(credential) === true;
  } catch {
    return false;
  }
}

// src/openclaw-agents.ts
var DEFAULT_AGENT_ID = "main";
var MAX_ID_LENGTH = 64;
var VALID_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
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
  if (id === void 0 || !isRecord2(agents)) return void 0;
  const wanted = normalizeAgentId(id);
  const { entries, list } = agents;
  if (Object.hasOwn(agents, "entries") && entries !== void 0) {
    if (!isRecord2(entries)) return void 0;
    const key = Object.keys(entries).find(
      (candidate) => isRecord2(entries[candidate]) && normalizeAgentId(candidate) === wanted
    );
    return key === void 0 ? void 0 : entries[key];
  }
  if (!Array.isArray(list)) return void 0;
  return list.find(
    (item) => isRecord2(item) && normalizeAgentId(item.id) === wanted
  );
}

// src/openclaw-gates.ts
var PASS = { outcome: "pass" };
var skip2 = (reason) => ({ outcome: "skip", reason });
var SUBAGENT_RUNTIME = "subagent";
var NO_MODEL_VALUE = "default";
function at(value, ...path) {
  let node = value;
  for (const key of path) {
    if (key === void 0 || !isRecord2(node) || !Object.hasOwn(node, key))
      return void 0;
    node = node[key];
  }
  return node;
}
var isSet = (v) => typeof v === "string" ? nonEmpty(v) !== void 0 : v !== void 0 && v !== null;
var agentField = (config, id, ...path) => at(findAgent(config, id), ...path);
function namesModel({ model }) {
  return isSet(model) && !(typeof model === "string" && model.trim() === NO_MODEL_VALUE);
}
function passesSilently(params) {
  const { runtime, agentId, task } = params;
  return typeof task !== "string" || namesModel(params) || isSet(runtime) && runtime !== SUBAGENT_RUNTIME || isSet(agentId) && typeof agentId !== "string" || params.visible === true || params.context === "fork" || params.mode === "session" || params.thread === true;
}
function otherAgentSkip(id, { config }) {
  if (config === void 0) return `${id} agent discovery failed`;
  const entry = agentField(config, id);
  if (!isRecord2(entry)) return `${id} agent unknown`;
  return isSet(at(entry, "model")) ? `${id} sets its own model` : void 0;
}
function subagentModelSet(input, target) {
  return isSet(agentField(input.config, target, "subagents", "model")) || isSet(at(input.config, "agents", "defaults", "subagents", "model"));
}
function effortRule(input) {
  const { params, config, requester, settings } = input;
  if (isSet(params.thinking)) return { kind: "keep", label: "caller effort" };
  const global = at(config, "agents", "defaults", "subagents", "thinking");
  const own = agentField(config, requester, "subagents", "thinking");
  const kept = isSet(global) || settings.scope === "core" && isSet(own);
  return kept ? { kind: "keep", label: "config effort" } : { kind: "set" };
}
function roleOf(input, target, own) {
  const description = agentField(input.config, target, "description");
  if (!own) return roleText(description);
  return nonEmpty(description) === void 0 ? DEFAULT_ROLE : roleText(description);
}
function gateSpawn(input) {
  const { params, requester, settings } = input;
  if (passesSilently(params)) return PASS;
  const named = typeof params.agentId === "string" && params.agentId !== "" ? params.agentId : void 0;
  const own = named === void 0 || requester !== void 0 && sameAgent(named, requester);
  const target = own ? requester : named;
  if (!input.hasKey) return skip2("key unset");
  if (!own && settings.scope === "core")
    return skip2(`${named} is outside the core scope`);
  if (subagentModelSet(input, target)) return skip2("subagent model set");
  if (!own) {
    const reason = otherAgentSkip(named, input);
    if (reason !== void 0) return skip2(reason);
  }
  if (settings.smallModel === void 0 && settings.largeModel === void 0)
    return skip2("no small or large model");
  if (input.config === void 0) return skip2(UNREADABLE);
  return {
    outcome: "route",
    agentId: target,
    role: roleOf(input, target, own),
    effort: effortRule(input)
  };
}

// src/openclaw-router.ts
var MIN_DEADLINE_MS = 1e3;
var LINE_PREFIX = "model-router ";
var SPAWN_TOOL = "sessions_spawn";
var MIDDLE_TIER = 1;
var SLOT_NAMES = { 0: "small", 2: "large" };
var hasKeys = (keys) => Object.keys(keys).length > 0;
async function score({ deps, signal, params }, settings, keys, gate) {
  const decision = await route({
    parts: [tier, work],
    state: {
      role: gate.role,
      description: nonEmpty(params.label) ?? nonEmpty(params.taskName) ?? "",
      task: prepareBrief(String(params.task))
    },
    attempts: plan(settings.provider, {
      typesafe: keys.typesafe !== void 0,
      openrouter: keys.openrouter !== void 0
    }),
    keys,
    fetchFn: deps.fetchFn,
    signal
  });
  return decide2(decision, tier.key, work.key);
}
async function slotFor({ api }, settings, config, agentId, level) {
  if (level === MIDDLE_TIER) return { model: void 0 };
  const name = SLOT_NAMES[level];
  const model = level === 0 ? settings.smallModel : settings.largeModel;
  if (model === void 0) return { skipped: `${name} model unset` };
  if (!await slotResolves(api.runtime, config, agentId, model))
    return { skipped: `${name} model unresolved` };
  return { model };
}
async function routeSpawn(spawn) {
  const { api, deps, params, requester, log } = spawn;
  const config = readLive(api);
  const settings = readSettings(config, api.pluginConfig);
  const keys = readKeys(config, api.pluginConfig, settings.provider, deps.env);
  const gate = gateSpawn({
    params,
    requester,
    config,
    settings,
    hasKey: hasKeys(keys)
  });
  if (gate.outcome === "pass") return void 0;
  if (gate.outcome === "skip") return void log(skippedLine(gate.reason));
  const decided = await score(spawn, settings, keys, gate);
  if ("skipped" in decided) return void log(skippedLine(decided.skipped));
  const slot = await slotFor(
    spawn,
    settings,
    config ?? {},
    gate.agentId,
    decided.tier
  );
  if ("skipped" in slot) return void log(skippedLine(slot.skipped));
  const { model } = slot;
  const kept = gate.effort.kind === "keep" ? gate.effort.label : void 0;
  const effort = effortFor(decided.tier, decided.work);
  log(
    routedLine({
      level: decided.tier,
      target: model,
      effort: kept ?? effort,
      probabilities: decided.probabilities,
      suffix: decided.suffix
    })
  );
  const set = {
    ...model === void 0 ? {} : { model },
    ...kept === void 0 ? { thinking: effort } : {}
  };
  return Object.keys(set).length === 0 ? void 0 : { params: set };
}
function createBeforeToolCall(api, deadlineMs, deps) {
  return async (event, ctx) => {
    try {
      if (deadlineMs < MIN_DEADLINE_MS || event?.toolName !== SPAWN_TOOL)
        return void 0;
      const stop = new AbortController();
      const signal = AbortSignal.any(
        ctx?.abortSignal ? [stop.signal, ctx.abortSignal] : [stop.signal]
      );
      const log = (message) => {
        if (!signal.aborted) api.logger.info(LINE_PREFIX + message);
      };
      return await new Promise((settle) => {
        const timer = deps.clock.after(deadlineMs, () => {
          stop.abort(LIMIT_REACHED);
          settle(void 0);
        });
        const requester = nonEmpty(ctx?.agentId);
        routeSpawn({ api, deps, signal, params: event.params, requester, log }).catch(() => void 0).then((result) => signal.aborted ? void 0 : result).then(settle).finally(() => timer.cancel());
      });
    } catch {
      return void 0;
    }
  };
}

// src/openclaw.ts
var HOOK_MARGIN_MS = 2e3;
var HOOK_TIMEOUT_MAX_MS = 6e5;
var PLUGIN_HOOK_TIMEOUT_MS = ROUTING_LIMIT_MS + HOOK_MARGIN_MS;
var realClock = {
  after: (ms, fn) => {
    const timer = setTimeout(fn, ms);
    return { cancel: () => clearTimeout(timer) };
  }
};
var usable = (value) => typeof value === "number" && Number.isInteger(value) && value > 0 && value <= HOOK_TIMEOUT_MAX_MS;
function effectiveTimeout(config) {
  const hooks = config.plugins?.entries?.[PLUGIN_ID]?.hooks;
  const perHook = isRecord2(hooks?.timeouts) ? hooks.timeouts.before_tool_call : void 0;
  return [perHook, hooks?.timeoutMs].find(usable) ?? PLUGIN_HOOK_TIMEOUT_MS;
}
var deadlineFor = (timeout) => Math.min(ROUTING_LIMIT_MS, timeout - HOOK_MARGIN_MS);
function warn(api, message) {
  try {
    api.logger.warn(LINE_PREFIX + message);
  } catch {
  }
}
function register(api, deps) {
  try {
    if (api.registrationMode !== "full") return;
    const timeout = effectiveTimeout(api.config);
    const deadline = deadlineFor(timeout);
    if (deadline < MIN_DEADLINE_MS)
      warn(
        api,
        `the hook timeout is ${timeout} ms, which leaves ${deadline} ms to route; the plugin routes nothing. Set it to ${MIN_DEADLINE_MS + HOOK_MARGIN_MS} ms or more.`
      );
    registerConfig(api, deps.env);
    api.on("before_tool_call", createBeforeToolCall(api, deadline, deps), {
      matcher: [SPAWN_TOOL],
      priority: 100,
      timeoutMs: PLUGIN_HOOK_TIMEOUT_MS
    });
  } catch {
    warn(api, "registration failed; the plugin is inert.");
  }
}
function createPlugin(deps = {
  fetchFn: streamedFetch,
  clock: realClock,
  env: process.env
}) {
  return { id: PLUGIN_ID, register: (api) => register(api, deps) };
}
var openclaw_default = createPlugin();
export {
  createPlugin,
  deadlineFor,
  openclaw_default as default
};
