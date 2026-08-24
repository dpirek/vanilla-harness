const DEFAULT_TOOL_PERMISSIONS = {
  list_files: true,
  read_file: true,
  write_file: true,
  search_files: true,
  curl: true,
  run_command: true,
  chrome_devtools: true,
};

function defaultProviderSettings() {
  return { provider: "openai", model: "gpt-5.1-codex", baseUrl: "", apiKey: "" };
}

function providerSettingsFromRecord(value = {}) {
  const defaults = defaultProviderSettings();
  return {
    provider: String(value.type || value.provider || defaults.provider),
    model: String(value.model || defaults.model),
    baseUrl: String(value.baseUrl || ""),
    apiKey: String(value.apiKey || ""),
  };
}

function matchingProviderId(providerRecords = [], settings = {}) {
  const expected = providerSettingsFromRecord(settings);
  const match = (Array.isArray(providerRecords) ? providerRecords : []).find((record) => {
    const candidate = providerSettingsFromRecord(record);
    return candidate.provider === expected.provider
      && candidate.model === expected.model
      && candidate.baseUrl === expected.baseUrl
      && candidate.apiKey === expected.apiKey;
  });
  return match ? String(match.id) : null;
}

function normalizeToolPermissions(value = {}) {
  return Object.fromEntries(Object.entries(DEFAULT_TOOL_PERMISSIONS).map(([name, defaultValue]) => [
    name,
    typeof value[name] === "boolean" ? value[name] : defaultValue,
  ]));
}

export {
  defaultProviderSettings,
  matchingProviderId,
  normalizeToolPermissions,
  providerSettingsFromRecord,
};
