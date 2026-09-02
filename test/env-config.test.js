import assert from "node:assert/strict";
import test from "node:test";

import { applyEnvironmentSettings, environmentDisablesFileAccess } from "../lib/env-config.js";

function createStore() {
  const configurations = [{
    id: "active", name: "Current",
    providerSettings: { provider: "openai", model: "old", baseUrl: "", apiKey: "" },
    componentState: { inputSource: "microphone", modelDisplay: "engine", effects: { composer: true, tools: true, mcp: true, validation: true } },
    systemPrompts: { agent_instructions: "old" },
    toolPermissions: { read_file: true, run_command: true },
    skillIds: [], mcpConfig: "",
  }];
  let saved;
  return {
    getRigConfigurations: () => ({ configurations, activeConfigurationId: "active" }),
    getSkills: () => [{ id: "skill-id", name: "Browser" }],
    setRigConfigurations(items, activeConfigurationId) {
      saved = { configurations: items, activeConfigurationId };
      return saved;
    },
    saved: () => saved,
  };
}

test("environment settings override individual active preset fields", () => {
  const store = createStore();
  applyEnvironmentSettings(store, {
    AI_PROVIDER: "custom", AI_MODEL: "model-1", AI_BASE_URL: "https://example.test/v1",
    AI_HARNESS_TOOL_READ_FILE: "false", AI_HARNESS_WORKFLOW_VALIDATION: "off",
    AI_HARNESS_AGENT_INSTRUCTIONS: "from env", AI_HARNESS_SKILLS: "browser",
  });
  const active = store.saved().configurations[0];
  assert.equal(active.providerSettings.provider, "custom");
  assert.equal(active.providerSettings.model, "model-1");
  assert.equal(active.providerSettings.baseUrl, "https://example.test/v1");
  assert.equal(active.toolPermissions.read_file, false);
  assert.equal(active.toolPermissions.run_command, true);
  assert.equal(active.componentState.effects.validation, false);
  assert.equal(active.systemPrompts.agent_instructions, "from env");
  assert.deepEqual(active.skillIds, ["skill-id"]);
});

test("environment settings reject invalid booleans and unknown skills", () => {
  assert.throws(() => applyEnvironmentSettings(createStore(), { AI_HARNESS_TOOL_READ_FILE: "sometimes" }), /must be true or false/);
  assert.throws(() => applyEnvironmentSettings(createStore(), { AI_HARNESS_SKILLS: "missing" }), /unknown skill/);
});

test("file access is disabled only when every file tool flag is false", () => {
  const disabled = {
    AI_HARNESS_TOOL_LIST_FILES: "false",
    AI_HARNESS_TOOL_READ_FILE: "0",
    AI_HARNESS_TOOL_WRITE_FILE: "no",
    AI_HARNESS_TOOL_SEARCH_FILES: "off",
  };
  assert.equal(environmentDisablesFileAccess(disabled), true);
  assert.equal(environmentDisablesFileAccess({ ...disabled, AI_HARNESS_TOOL_READ_FILE: "true" }), false);
  assert.equal(environmentDisablesFileAccess({}), false);
});
