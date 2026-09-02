import {
  defaultBaseUrlForProvider,
  defaultModelForProvider,
  normalizeProvider,
  resolveProviderApiKey,
} from "../lib/provider-config.js";
import {
  normalizeSkillName,
  skillDraft,
  syncSkillContentName,
  validateSkillContent,
} from "../public/lib/skill-content.js";
import { json, methodNotAllowed, readRequestBody } from "./http.js";

export function createSettingsApiHandlers({ uiStateStore, defaultWorkspace, environmentFileDetected = false }) {
  async function handleHealthApi(req, res) {
    const envProvider = normalizeProvider(process.env.AI_PROVIDER);
    const storedSettings = uiStateStore.getSelectedProvider() || {};
    json(res, 200, {
      ok: true,
      provider: envProvider,
      model: process.env.AI_MODEL || defaultModelForProvider(envProvider),
      ollamaModel: process.env.OLLAMA_MODEL || "llama3.1",
      ollamaBaseUrl: process.env.OLLAMA_BASE_URL || "http://localhost:11434",
      customModel: process.env.CUSTOM_AI_MODEL || "custom-model",
      customBaseUrl: process.env.CUSTOM_AI_BASE_URL || "http://localhost:8000/v1",
      hasApiKey: Boolean(storedSettings.apiKey),
      approveAll: true,
      workspace: defaultWorkspace,
      environmentFileDetected,
    });
  }

  async function handleConfigApi(req, res) {
    if (req.method === "GET") {
      const content = uiStateStore.getMcpConfig();
      json(res, 200, { ok: true, exists: content !== undefined, path: "db/ui-state.sqlite", content: content || "" });
      return;
    }

    if (req.method === "PUT") {
      try {
        const body = JSON.parse(await readRequestBody(req));
        if (typeof body.content !== "string") {
          json(res, 400, { ok: false, error: "Expected string content." });
          return;
        }
        uiStateStore.setMcpConfig(body.content);
        json(res, 200, {
          ok: true,
          path: "db/ui-state.sqlite",
          bytes: Buffer.byteLength(body.content),
        });
      } catch (error) {
        json(res, 400, { ok: false, error: error.message });
      }
      return;
    }

    methodNotAllowed(res, "GET, PUT");
  }

  async function handleModelsApi(req, res) {
    if (req.method !== "POST") {
      methodNotAllowed(res, "POST");
      return;
    }

    try {
      const body = JSON.parse(await readRequestBody(req, 20_000) || "{}");
      const provider = normalizeProvider(body.provider);
      const baseUrl = String(body.baseUrl || "").trim();
      const storedSettings = uiStateStore.getAll().providerSettings || {};
      const storedApiKey = storedSettings.provider === provider ? storedSettings.apiKey : "";
      const apiKey = String(body.apiKey || storedApiKey || "").trim();

      if (provider === "ollama") {
        const origin = (baseUrl || process.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/$/, "");
        const response = await fetch(`${origin}/api/tags`);
        const text = await response.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch {
          throw new Error(`Ollama returned invalid JSON (HTTP ${response.status}): ${text}`);
        }
        if (!response.ok) throw new Error(`Ollama API error (HTTP ${response.status}): ${data.error || text}`);
        const models = (data.models || [])
          .map((model) => model.model || model.name)
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b));
        json(res, 200, { ok: true, provider, models });
        return;
      }

      const origin = (baseUrl || defaultBaseUrlForProvider(provider) || "https://api.openai.com/v1").replace(/\/$/, "");
      const bearer = resolveProviderApiKey(provider, apiKey);
      if (provider === "openai" && !bearer) {
        json(res, 400, { ok: false, error: "Save an OpenAI API key in Provider settings first." });
        return;
      }
      const headers = {};
      if (bearer) headers.authorization = `Bearer ${bearer}`;
      const response = await fetch(`${origin}/models`, { headers });
      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`${provider === "custom" ? "Custom provider" : "OpenAI"} returned invalid JSON (HTTP ${response.status}): ${text}`);
      }
      if (!response.ok) {
        const message = data.error?.message || JSON.stringify(data);
        throw new Error(`${provider === "custom" ? "Custom provider" : "OpenAI"} API error (HTTP ${response.status}): ${message}`);
      }
      const models = (data.data || [])
        .map((model) => model.id)
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));
      json(res, 200, { ok: true, provider, models });
    } catch (error) {
      json(res, 400, { ok: false, error: error.message });
    }
  }

  async function handleUiStateApi(req, res) {
    if (req.method === "GET") {
      json(res, 200, { ok: true, state: uiStateStore.getAll() });
      return;
    }
    if (req.method === "PUT") {
      try {
        const body = JSON.parse(await readRequestBody(req, 50 * 1024 * 1024) || "{}");
        uiStateStore.set(body.state);
        json(res, 200, { ok: true });
      } catch (error) {
        json(res, 400, { ok: false, error: error.message });
      }
      return;
    }
    methodNotAllowed(res, "GET, PUT");
  }

  async function handleRigConfigurationsApi(req, res) {
    if (req.method === "GET") {
      json(res, 200, { ok: true, ...uiStateStore.getRigConfigurations() });
      return;
    }
    if (req.method === "PUT") {
      try {
        const body = JSON.parse(await readRequestBody(req, 250_000) || "{}");
        const result = uiStateStore.setRigConfigurations(body.configurations, body.activeConfigurationId);
        json(res, 200, { ok: true, ...result });
      } catch (error) {
        json(res, 400, { ok: false, error: error.message });
      }
      return;
    }
    methodNotAllowed(res, "GET, PUT");
  }

  async function handleSystemPromptsApi(req, res) {
    if (req.method === "GET") {
      json(res, 200, { ok: true, prompts: uiStateStore.getSystemPromptRows() });
      return;
    }
    if (req.method === "PUT") {
      try {
        const body = JSON.parse(await readRequestBody(req, 100_000) || "{}");
        if (typeof body.key !== "string" || typeof body.content !== "string") {
          throw new Error("Expected prompt key and content.");
        }
        uiStateStore.setSystemPrompt(body.key, body.content);
        json(res, 200, { ok: true });
      } catch (error) {
        json(res, 400, { ok: false, error: error.message });
      }
      return;
    }
    methodNotAllowed(res, "GET, PUT");
  }

  async function handleSkillsApi(req, res) {
    if (req.method === "GET") {
      json(res, 200, { ok: true, skills: uiStateStore.getSkills() });
      return;
    }
    if (req.method === "POST") {
      try {
        const body = JSON.parse(await readRequestBody(req, 2_100_000) || "{}");
        if (typeof body.name !== "string") throw new Error("Expected skill name.");
        const name = normalizeSkillName(body.name);
        if (!name) throw new Error("Enter a skill name using letters, numbers, and hyphens.");
        const draft = typeof body.content === "string" && body.content.trim()
          ? body.content
          : skillDraft(name);
        const content = validateSkillContent(syncSkillContentName(draft, name));
        json(res, 200, { ok: true, ...uiStateStore.createSkill({ name, content }) });
      } catch (error) {
        json(res, 400, { ok: false, error: error.message });
      }
      return;
    }
    if (req.method === "PUT") {
      try {
        const body = JSON.parse(await readRequestBody(req, 2_100_000) || "{}");
        if (Array.isArray(body.selectedSkillIds)) {
          json(res, 200, { ok: true, skills: uiStateStore.setSelectedSkills(body.selectedSkillIds) });
          return;
        }
        if (typeof body.skillId === "string" && typeof body.content === "string") {
          const skill = uiStateStore.getSkills().find((entry) => entry.id === body.skillId);
          if (!skill) throw new Error(`Unknown skill: ${body.skillId}`);
          const name = normalizeSkillName(typeof body.name === "string" ? body.name : skill.name);
          if (!name) throw new Error("Enter a skill name using letters, numbers, and hyphens.");
          const content = validateSkillContent(syncSkillContentName(body.content, name));
          json(res, 200, {
            ok: true,
            ...uiStateStore.updateSkill(body.skillId, { name, content }),
          });
          return;
        }
        throw new Error("Expected selected skill ids or skill content.");
      } catch (error) {
        json(res, 400, { ok: false, error: error.message });
      }
      return;
    }
    methodNotAllowed(res, "GET, POST, PUT");
  }

  return {
    "/api/health": handleHealthApi,
    "/api/config": handleConfigApi,
    "/api/models": handleModelsApi,
    "/api/ui-state": handleUiStateApi,
    "/api/rig-configurations": handleRigConfigurationsApi,
    "/api/system-prompts": handleSystemPromptsApi,
    "/api/skills": handleSkillsApi,
  };
}
