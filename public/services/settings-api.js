import { jsonOptions, requestJson } from "./api-client.js";

async function loadSystemPrompts() {
  const payload = await requestJson("/api/system-prompts", {}, "Unable to load system prompts.");
  return payload.prompts || [];
}

function saveSystemPrompt(key, content) {
  return requestJson("/api/system-prompts", jsonOptions("PUT", { key, content }), "Unable to save system prompt.");
}

async function loadSkills() {
  const payload = await requestJson("/api/skills", {}, "Unable to load skills.");
  return payload.skills || [];
}

function saveSelectedSkills(selectedSkillIds) {
  return requestJson("/api/skills", jsonOptions("PUT", { selectedSkillIds }), "Unable to save skills.");
}

function saveSkillContent(skillId, content) {
  return requestJson("/api/skills", jsonOptions("PUT", { skillId, content }), "Unable to save skill.");
}

function createSkill(name, content) {
  return requestJson("/api/skills", jsonOptions("POST", { name, content }), "Unable to create skill.");
}

function loadProviderModels({ provider, baseUrl, apiKey }) {
  return requestJson(
    "/api/models",
    jsonOptions("POST", { provider, baseUrl, apiKey }),
    "Unable to load models.",
  );
}

function loadConfig() {
  return requestJson("/api/config", {}, "Unable to load config.");
}

function saveConfig(content) {
  return requestJson("/api/config", jsonOptions("PUT", { content }), "Unable to save config.");
}

function loadHealth() {
  return requestJson("/api/health", {}, "Unable to load server health.");
}

function loadRigConfigurations() {
  return requestJson("/api/rig-configurations", {}, "Unable to load rig configurations.");
}

function saveRigConfigurations(configurations, activeConfigurationId) {
  return requestJson(
    "/api/rig-configurations",
    jsonOptions("PUT", { configurations, activeConfigurationId }),
    "Unable to save rig configurations.",
  );
}

export {
  loadConfig,
  createSkill,
  loadHealth,
  loadProviderModels,
  loadRigConfigurations,
  loadSkills,
  loadSystemPrompts,
  saveConfig,
  saveRigConfigurations,
  saveSkillContent,
  saveSelectedSkills,
  saveSystemPrompt,
};
