import { enrichOllamaPrices } from "../lib/ollama-pricing.js";
import { huggingFaceModelPricing } from "../lib/huggingface-pricing.js";
import { enrichDeepSeekPrices } from "../lib/deepseek-pricing.js";
import { enrichOpenAiPrices } from "../lib/openai-pricing.js";
import {
  defaultBaseUrlForProvider,
  defaultModelForProvider,
  normalizeProvider,
  normalizeOllamaBaseUrl,
  resolveProviderApiKey,
} from "../lib/provider-config.js";
import { benchmarkModel } from "../lib/model-benchmark.js";
import { createModelClient } from "../lib/openai.js";
import {
  normalizeSkillName,
  skillDraft,
  syncSkillContentName,
  validateSkillContent,
} from "../public/lib/skill-content.js";
import { json, methodNotAllowed, readRequestBody } from "./http.js";

export function catalogModel(model) {
  const id = String(model?.id || model?.model || model?.name || "").trim();
  if (!id) return null;
  const supported = Array.isArray(model.supported_parameters)
    ? model.supported_parameters
    : Array.isArray(model.capabilities)
      ? model.capabilities
      : null;
  const pricing = model.pricing && typeof model.pricing === "object" ? model.pricing : {};
  return {
    id,
    tools: supported ? supported.some((value) => ["tools", "tool_choice", "tool_use"].includes(String(value))) : null,
    throughput: firstFinite(model.throughput, model.performance?.throughput, model.tokens_per_second),
    latency: firstFinite(model.latency, model.performance?.latency, model.latency_ms),
    context: firstFinite(model.context_length, model.context_window, model.top_provider?.context_length, model.details?.context_length),
    inputCost: firstNonNegative(pricing.prompt, pricing.input, model.input_cost_per_token),
    outputCost: firstNonNegative(pricing.completion, pricing.output, model.output_cost_per_token),
  };
}

function firstFinite(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function firstNonNegative(...values) {
  const number = firstFinite(...values);
  return number !== null && number >= 0 ? number : null;
}

export function createSettingsApiHandlers({
  uiStateStore,
  defaultWorkspace,
  environmentFileDetected = false,
  fileAccessDisabledByEnvironment = false,
  onRigConfigurationsChanged = () => {},
}) {
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
      approveAll: false,
      workspace: defaultWorkspace,
      workspaceConfiguredByEnvironment: Boolean(process.env.AI_HARNESS_WORKSPACE?.trim()),
      environmentFileDetected,
      fileAccessDisabledByEnvironment,
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
        const origin = normalizeOllamaBaseUrl(baseUrl || process.env.OLLAMA_BASE_URL || "http://localhost:11434");
        const bearer = resolveProviderApiKey("ollama", apiKey);
        const response = await fetch(`${origin}/api/tags`, {
          headers: bearer ? { authorization: `Bearer ${bearer}` } : {},
        });
        const text = await response.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch {
          throw new Error(`Ollama returned invalid JSON (HTTP ${response.status}): ${text}`);
        }
        if (!response.ok) throw new Error(`Ollama API error (HTTP ${response.status}): ${data.error || text}`);
        let modelDetails = (data.models || [])
          .map(catalogModel)
          .filter(Boolean)
          .sort((a, b) => a.id.localeCompare(b.id));
        if (new URL(origin).hostname === "ollama.com") {
          modelDetails = await enrichOllamaPrices(modelDetails);
        }
        json(res, 200, { ok: true, provider, models: modelDetails.map((model) => model.id), modelDetails });
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
      let modelDetails = (data.data || [])
        .map((model) => {
          const entry = catalogModel(model);
          return entry && new URL(origin).hostname === "router.huggingface.co"
            ? { ...entry, ...huggingFaceModelPricing(model) }
            : entry;
        })
        .filter(Boolean)
        .sort((a, b) => a.id.localeCompare(b.id));
      if (new URL(origin).hostname === "api.openai.com") {
        modelDetails = await enrichOpenAiPrices(modelDetails);
      } else if (new URL(origin).hostname === "api.deepseek.com") {
        modelDetails = await enrichDeepSeekPrices(modelDetails);
      }
      json(res, 200, { ok: true, provider, models: modelDetails.map((model) => model.id), modelDetails });
    } catch (error) {
      json(res, 400, { ok: false, error: error.message });
    }
  }

  async function handleModelTestApi(req, res) {
    if (req.method !== "POST") {
      methodNotAllowed(res, "POST");
      return;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
    try {
      const body = JSON.parse(await readRequestBody(req, 20_000) || "{}");
      const providerId = String(body.providerId || "");
      const model = String(body.model || "").trim();
      const providers = uiStateStore.getProviders();
      const provider = providers.find((item) => item.id === providerId);
      if (!provider) throw new Error("The selected provider no longer exists.");
      const modelIds = new Set([
        provider.model,
        ...(Array.isArray(provider.models) ? provider.models : []).map((item) =>
          typeof item === "string" ? item : item?.id),
      ].filter(Boolean));
      if (!model || !modelIds.has(model)) throw new Error("The selected model is not available from this provider.");
      const client = createModelClient({
        provider: provider.type,
        baseUrl: provider.baseUrl,
        apiKey: provider.apiKey,
        fetchImpl: (url, options = {}) => fetch(url, { ...options, signal: controller.signal }),
      });
      const benchmark = await benchmarkModel(client, model);
      const nextProviders = providers.map((item) => {
        if (item.id !== providerId) return item;
        const existingModels = Array.isArray(item.models) ? item.models : [];
        let matched = false;
        const models = existingModels.map((entry) => {
          const id = typeof entry === "string" ? entry : entry?.id;
          if (id !== model) return entry;
          matched = true;
          return { ...(typeof entry === "object" ? entry : { id }), ...benchmark };
        });
        if (!matched) models.push({ id: model, ...benchmark });
        return { ...item, models };
      });
      uiStateStore.set({ providers: nextProviders });
      json(res, 200, { ok: true, providerId, model, benchmark });
    } catch (error) {
      const message = error.name === "AbortError" ? "Model test timed out after 60 seconds." : error.message;
      json(res, 400, { ok: false, error: message });
    } finally {
      clearTimeout(timeout);
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

  async function handleTaskRatingsApi(req, res) {
    if (req.method === "GET") {
      json(res, 200, { ok: true, ratings: uiStateStore.getTaskRatings() });
      return;
    }
    if (req.method === "PUT") {
      try {
        const body = JSON.parse(await readRequestBody(req, 1_000_000) || "{}");
        const rating = uiStateStore.setTaskRating(body);
        json(res, 200, { ok: true, rating });
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
        onRigConfigurationsChanged(result);
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
    "/api/model-test": handleModelTestApi,
    "/api/task-ratings": handleTaskRatingsApi,
    "/api/ui-state": handleUiStateApi,
    "/api/rig-configurations": handleRigConfigurationsApi,
    "/api/system-prompts": handleSystemPromptsApi,
    "/api/skills": handleSkillsApi,
  };
}
