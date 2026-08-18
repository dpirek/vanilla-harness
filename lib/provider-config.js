const PROVIDER_TYPES = new Set(["openai", "ollama", "custom"]);

function normalizeProvider(value) {
  return PROVIDER_TYPES.has(value) ? value : "openai";
}

function isProviderType(value) {
  return PROVIDER_TYPES.has(String(value || "").trim().toLowerCase());
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

function providerSettingsFromRecord(record = {}) {
  return {
    provider: normalizeProvider(record.type || record.provider),
    model: typeof record.model === "string" ? record.model.trim() : "",
    baseUrl: typeof record.baseUrl === "string" ? record.baseUrl.trim() : "",
    apiKey: typeof record.apiKey === "string" ? record.apiKey.trim() : "",
  };
}

function resolveProviderSelection(selector, providers = []) {
  const value = String(selector || "").trim();
  if (!value) throw new Error("Provide a provider id, name, or type.");

  const byId = providers.find((provider) => String(provider.id) === value);
  if (byId) return { kind: "saved", provider: byId };

  const lowerValue = value.toLowerCase();
  const byName = providers.filter((provider) => String(provider.name || "").trim().toLowerCase() === lowerValue);
  if (byName.length === 1) return { kind: "saved", provider: byName[0] };
  if (byName.length > 1) throw new Error(`Multiple providers are named "${value}". Use the provider id.`);

  if (!isProviderType(value)) {
    throw new Error(`Unknown provider "${value}". Use /providers to inspect saved providers.`);
  }

  const type = normalizeProvider(lowerValue);
  const byType = providers.filter((provider) => normalizeProvider(provider.type || provider.provider) === type);
  if (byType.length === 1) return { kind: "saved", provider: byType[0] };
  if (byType.length > 1) {
    throw new Error(`Multiple saved ${type} providers exist. Use the provider id or name.`);
  }
  return { kind: "type", providerType: type };
}

export {
  defaultBaseUrlForProvider,
  defaultModelForProvider,
  isProviderType,
  normalizeProvider,
  providerSettingsFromRecord,
  resolveProviderApiKey,
  resolveProviderSelection,
};
