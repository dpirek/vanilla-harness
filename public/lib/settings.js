const DEFAULT_TOOL_PERMISSIONS = {
  list_files: true,
  read_file: true,
  write_file: true,
  search_files: true,
  curl: true,
  run_command: true,
};

function defaultProviderSettings() {
  return { provider: "openai", model: "gpt-5.1-codex", baseUrl: "", apiKey: "" };
}

function normalizeToolPermissions(value = {}) {
  return Object.fromEntries(Object.entries(DEFAULT_TOOL_PERMISSIONS).map(([name, defaultValue]) => [
    name,
    typeof value[name] === "boolean" ? value[name] : defaultValue,
  ]));
}

export {
  defaultProviderSettings,
  normalizeToolPermissions,
};
