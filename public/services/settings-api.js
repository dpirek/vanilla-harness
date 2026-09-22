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

function loadSkillSettings() {
  return requestJson("/api/skills", {}, "Unable to load skills.");
}

async function loadSkill(skillId) {
  const query = new URLSearchParams({ skillId });
  const payload = await requestJson(`/api/skills?${query}`, {}, "Unable to load skill.");
  return payload.skill;
}

function saveSelectedSkills(selectedSkillIds, skillAutoDiscovery) {
  return requestJson("/api/skills", jsonOptions("PUT", { selectedSkillIds, ...(typeof skillAutoDiscovery === "boolean" ? { skillAutoDiscovery } : {}) }), "Unable to save skills.");
}

function saveSkill(skillId, name, content) {
  return requestJson("/api/skills", jsonOptions("PUT", { skillId, name, content }), "Unable to save skill.");
}

function createSkill(name, content) {
  return requestJson("/api/skills", jsonOptions("POST", { name, content }), "Unable to create skill.");
}

function importSkill(files) {
  return requestJson("/api/skills", jsonOptions("POST", { action: "import", files }), "Unable to import skill.");
}

function testSkill(skillId) {
  return requestJson("/api/skills", jsonOptions("POST", { action: "test", skillId }), "Unable to test skill.");
}

async function loadSkillResource(skillId, resource) {
  const query = new URLSearchParams({ skillId, resource });
  const payload = await requestJson(`/api/skills?${query}`, {}, "Unable to load skill resource.");
  return payload.content;
}

function saveSkillResource(skillId, resource, content) {
  return requestJson("/api/skills", jsonOptions("PUT", { skillId, resource, content }), "Unable to save skill resource.");
}

function loadProviderModels({ provider, baseUrl, apiKey }) {
  return requestJson(
    "/api/models",
    jsonOptions("POST", { provider, baseUrl, apiKey }),
    "Unable to load models.",
  );
}

function testProviderModel(providerId, model) {
  return requestJson(
    "/api/model-test",
    jsonOptions("POST", { providerId, model }),
    "Unable to test model performance.",
  );
}

async function loadTaskRatings() {
  const payload = await requestJson("/api/task-ratings", {}, "Unable to load task ratings.");
  return payload.ratings || [];
}

async function saveTaskRating(record) {
  const payload = await requestJson(
    "/api/task-ratings",
    jsonOptions("PUT", record),
    "Unable to save task rating.",
  );
  return payload.rating;
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
  importSkill,
  loadHealth,
  loadProviderModels,
  loadRigConfigurations,
  loadSkills,
  loadSkillSettings,
  loadSkill,
  loadSkillResource,
  loadSystemPrompts,
  loadTaskRatings,
  saveConfig,
  saveRigConfigurations,
  saveSkill,
  saveSkillResource,
  saveSelectedSkills,
  saveSystemPrompt,
  saveTaskRating,
  testProviderModel,
  testSkill,
};
