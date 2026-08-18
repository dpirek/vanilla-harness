const PROVIDER_TYPES = new Set(["openai", "ollama", "custom"]);

function normalizeProvider(value) {
  return PROVIDER_TYPES.has(value) ? value : "openai";
}

function defaultModelForProvider(provider, env = process.env) {
  if (provider === "ollama") return env.OLLAMA_MODEL || "llama3.1";
  if (provider === "custom") return env.CUSTOM_AI_MODEL || "custom-model";
  return env.OPENAI_MODEL || "gpt-5.1-codex";
}

function defaultBaseUrlForProvider(provider, env = process.env) {
  if (provider === "ollama") return env.OLLAMA_BASE_URL || "http://localhost:11434";
  if (provider === "custom") return env.CUSTOM_AI_BASE_URL || "http://localhost:8000/v1";
  return env.OPENAI_BASE_URL || "";
}

function resolveProviderApiKey(provider, apiKey = "", env = process.env) {
  const trimmed = String(apiKey || "").trim();
  if (trimmed) return trimmed;
  if (provider === "custom") return env.CUSTOM_AI_API_KEY || "";
  if (provider === "openai") return env.OPENAI_API_KEY || "";
  return "";
}

export {
  defaultBaseUrlForProvider,
  defaultModelForProvider,
  normalizeProvider,
  resolveProviderApiKey,
};
