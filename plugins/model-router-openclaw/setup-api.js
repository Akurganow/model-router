// src/core/options/migrate.ts
var STEPS = [];
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

// src/utils/guards.ts
var isRecord = (v) => typeof v === "object" && v !== null;

// src/core/decision/slots.ts
var SLOTS = ["small", "middle", "large"];
var slotSetting = (slot) => `${slot}_model`;
var SLOT_SETTINGS = SLOTS.map(slotSetting);

// src/core/providers/provider.ts
var MAKERS = ["typesafe", "openai", "google", "perplexity"];
var KEY_HOLDERS = [...MAKERS, "openrouter"];
var GATEWAYS = [
  "direct",
  "auto",
  "openrouter-first",
  "openrouter"
];

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
      typesafe: "Jev from TypeSafe",
      openai: "OpenAI's decision model",
      google: "Google's decision model",
      perplexity: "Perplexity's decision model"
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
      core: "the default agents only",
      extended: "also other agents, as the README lists"
    }
  }
};
var PAGE_MAX = 4;
var PAGE_VALUES = PAGE_MAX - 1;
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
