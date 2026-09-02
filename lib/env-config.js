import fs from "node:fs";

export function loadEnvironmentFile(filePath) {
  if (!fs.existsSync(filePath)) return false;
  process.loadEnvFile(filePath);
  return true;
}

export function activateEnvironmentPreset(uiStateStore, selector) {
  const value = String(selector || "").trim();
  if (!value) return uiStateStore.getRigConfigurations();

  const current = uiStateStore.getRigConfigurations();
  const normalizedValue = value.toLocaleLowerCase();
  const preset = current.configurations.find((configuration) => (
    configuration.id === value || configuration.name.toLocaleLowerCase() === normalizedValue
  ));
  if (!preset) {
    throw new Error(`AI_HARNESS_PRESET does not match a preset id or name: ${value}`);
  }
  if (preset.id === current.activeConfigurationId) return current;
  return uiStateStore.setRigConfigurations(current.configurations, preset.id);
}
