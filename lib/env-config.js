import fs from "node:fs";
import path from "node:path";

const TOOL_ENV_KEYS = {
  list_files: "AI_HARNESS_TOOL_LIST_FILES", read_file: "AI_HARNESS_TOOL_READ_FILE",
  write_file: "AI_HARNESS_TOOL_WRITE_FILE", search_files: "AI_HARNESS_TOOL_SEARCH_FILES",
  curl: "AI_HARNESS_TOOL_CURL", run_command: "AI_HARNESS_TOOL_RUN_COMMAND",
  chrome_devtools: "AI_HARNESS_TOOL_CHROME_DEVTOOLS",
};
const WORKFLOW_ENV_KEYS = {
  composer: "AI_HARNESS_WORKFLOW_COMPOSER", tools: "AI_HARNESS_WORKFLOW_TOOLS",
  mcp: "AI_HARNESS_WORKFLOW_MCP", validation: "AI_HARNESS_WORKFLOW_VALIDATION",
};
const PROMPT_ENV_KEYS = {
  prompt_refinement: "AI_HARNESS_PROMPT_REFINEMENT",
  agent_instructions: "AI_HARNESS_AGENT_INSTRUCTIONS",
  workspace_context: "AI_HARNESS_WORKSPACE_CONTEXT",
  tool_contract: "AI_HARNESS_TOOL_CONTRACT",
  validation_reminder: "AI_HARNESS_VALIDATION_REMINDER",
};

export function loadEnvironmentFile(filePath) {
  if (!fs.existsSync(filePath)) return false;
  process.loadEnvFile(filePath);
  return true;
}

function environmentBoolean(env, key) {
  if (!Object.hasOwn(env, key)) return undefined;
  const value = String(env[key]).trim().toLocaleLowerCase();
  if (["1", "true", "yes", "on"].includes(value)) return true;
  if (["0", "false", "no", "off"].includes(value)) return false;
  throw new Error(`${key} must be true or false.`);
}

export function environmentDisablesFileAccess(env = process.env) {
  return ["list_files", "read_file", "write_file", "search_files"]
    .every((setting) => environmentBoolean(env, TOOL_ENV_KEYS[setting]) === false);
}

export function applyEnvironmentSettings(uiStateStore, env = process.env, root = process.cwd()) {
  const current = uiStateStore.getRigConfigurations();
  const active = current.configurations.find(({ id }) => id === current.activeConfigurationId) || current.configurations[0];
  if (!active) return current;
  const next = structuredClone(active);

  if (env.AI_PROVIDER?.trim()) next.providerSettings.provider = env.AI_PROVIDER.trim();
  if (env.AI_MODEL?.trim()) next.providerSettings.model = env.AI_MODEL.trim();
  if (Object.hasOwn(env, "AI_BASE_URL")) next.providerSettings.baseUrl = String(env.AI_BASE_URL).trim();
  if (Object.hasOwn(env, "AI_API_KEY")) next.providerSettings.apiKey = String(env.AI_API_KEY).trim();
  if (env.AI_HARNESS_INPUT_SOURCE?.trim()) next.componentState.inputSource = env.AI_HARNESS_INPUT_SOURCE.trim();
  if (env.AI_HARNESS_MODEL_DISPLAY?.trim()) next.componentState.modelDisplay = env.AI_HARNESS_MODEL_DISPLAY.trim();

  for (const [setting, key] of Object.entries(TOOL_ENV_KEYS)) {
    const value = environmentBoolean(env, key);
    if (value !== undefined) next.toolPermissions[setting] = value;
  }
  for (const [setting, key] of Object.entries(WORKFLOW_ENV_KEYS)) {
    const value = environmentBoolean(env, key);
    if (value !== undefined) next.componentState.effects[setting] = value;
  }
  for (const [setting, key] of Object.entries(PROMPT_ENV_KEYS)) {
    if (Object.hasOwn(env, key)) next.systemPrompts[setting] = String(env[key]);
  }
  if (Object.hasOwn(env, "AI_HARNESS_SKILLS")) {
    const requested = String(env.AI_HARNESS_SKILLS).split(",").map((value) => value.trim()).filter(Boolean);
    const skills = uiStateStore.getSkills();
    next.skillIds = requested.map((selector) => {
      const normalized = selector.toLocaleLowerCase();
      const skill = skills.find(({ id, name }) => id === selector || name.toLocaleLowerCase() === normalized);
      if (!skill) throw new Error(`AI_HARNESS_SKILLS contains an unknown skill: ${selector}`);
      return skill.id;
    });
  }
  if (Object.hasOwn(env, "AI_HARNESS_MCP_CONFIG")) {
    next.mcpConfig = String(env.AI_HARNESS_MCP_CONFIG);
  } else if (env.AI_HARNESS_MCP_CONFIG_PATH?.trim()) {
    next.mcpConfig = fs.readFileSync(path.resolve(root, env.AI_HARNESS_MCP_CONFIG_PATH.trim()), "utf8");
  }

  const configurations = current.configurations.map((configuration) => (
    configuration.id === active.id ? { ...next, updatedAt: Date.now() } : configuration
  ));
  return uiStateStore.setRigConfigurations(configurations, active.id);
}
