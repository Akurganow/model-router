// src/utils/text.ts
var nonEmpty = (value) => {
  const text = typeof value === "string" ? value.trim() : "";
  return text === "" ? void 0 : text;
};
var textOf = (value) => {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
};

// src/core/providers/provider.ts
var MAKERS = ["typesafe", "openai", "google"];
var KEY_HOLDERS = [...MAKERS, "openrouter"];
var GATEWAYS = [
  "direct",
  "auto",
  "openrouter-first",
  "openrouter"
];

// src/utils/guards.ts
var isRecord = (v) => typeof v === "object" && v !== null;
var isPlainObject = (value) => {
  if (typeof value !== "object" || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

// src/core/options/models.ts
var QUOTED_KEY = /"(?:[^"\\]|\\.)*"(?=\s*:)/g;
var JSON_CHARS = /["{}]/;
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
function parseJson(text) {
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
    const entry = part.trim();
    const colon = entry.indexOf(":");
    if (colon < 0 || JSON_CHARS.test(entry.slice(colon + 1)) || !accept(named, entry.slice(0, colon), entry.slice(colon + 1)))
      return { invalid: entry === "" ? text : entry };
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
    const parsed = parseJson(text);
    if (isPlainObject(parsed)) {
      const read = readObject(parsed);
      if ("invalid" in read) return read;
      const repeated = repeatedKey(text);
      return repeated === void 0 ? read : { invalid: repeated };
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
  const read = readModels(models);
  if ("invalid" in read || read.models[maker] !== void 0) return void 0;
  const text = typeof models === "string" ? models.trim() : void 0;
  const parsed = text?.startsWith("{") ? parseJson(text) : void 0;
  let added;
  if (isPlainObject(models)) added = { ...models, [maker]: name };
  else if (isPlainObject(parsed))
    added = JSON.stringify({ ...parsed, [maker]: name });
  else added = formatModels({ ...read.models, [maker]: name });
  const back = readModels(added);
  return "models" in back && sameNames(back.models, { ...read.models, [maker]: name }) ? added : void 0;
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

// src/core/decision/slots.ts
var SLOTS = ["small", "middle", "large"];
var slotSetting = (slot) => `${slot}_model`;
var SLOT_SETTINGS = SLOTS.map(slotSetting);

// src/core/parts/part.ts
var LEVELS = [0, 1, 2];

// src/core/scoring/failure.ts
var MALFORMED = { failure: "malformed" };

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
function parseJson2(text) {
  try {
    return JSON.parse(text);
  } catch {
    return void 0;
  }
}
var replyReader = (probabilitiesOf, usageOf) => (parts, text) => {
  const reply = parseJson2(text);
  const { answers, model, usage } = isRecord(reply) ? reply : {};
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

// src/core/scoring/formats/openai-decisions.ts
function listAnswer(answers, key) {
  if (!Array.isArray(answers)) return void 0;
  const [item, ...others] = answers.filter(isRecord).filter(({ name }) => name === key);
  if (!item || others.length > 0) return void 0;
  const { type, probabilities } = item;
  if (type !== "score" || !Array.isArray(probabilities)) return void 0;
  if (probabilities.length !== LEVELS.length) return void 0;
  const byValue = /* @__PURE__ */ new Map();
  for (const entry of probabilities) {
    if (!isRecord(entry)) return void 0;
    const { value, probability } = entry;
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

// src/core/scoring/formats/system-one.ts
var SYSTEM_ONE = {
  body: (parts, state, model) => JSON.stringify({ state, model, questions: questionMap(parts) }),
  read: replyReader(mapAnswer, usageNamed("input_tokens", "output_tokens"))
};

// src/core/options/scope.ts
var SCOPE_VALUES = ["core", "extended"];
var DEFAULT_SCOPE = SCOPE_VALUES[0];

// src/core/options/settings.ts
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

// src/adapters/openclaw/setup.ts
function migrateConfig(config) {
  const entry = pluginEntry(config);
  const settings = entry?.config;
  if (entry === void 0 || !isRecord(settings))
    return { config, changes: [] };
  const { stored, changes } = migrate(settings);
  if (changes.length === 0) return { config, changes: [] };
  const plugins = config.plugins ?? {};
  return {
    config: {
      ...config,
      plugins: {
        ...plugins,
        entries: {
          ...plugins.entries,
          [PLUGIN_ID]: { ...entry, config: { ...stored } }
        }
      }
    },
    changes: [...changes]
  };
}
var setup_default = {
  id: PLUGIN_ID,
  register: (api) => api.registerConfigMigration(migrateConfig)
};
export {
  setup_default as default,
  migrateConfig
};
