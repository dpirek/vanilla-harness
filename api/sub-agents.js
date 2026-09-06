import { json, methodNotAllowed, readRequestBody } from "./http.js";

export function createSubAgentApiHandlers({ subAgentManager }) {
  async function handleSubAgentsApi(req, res) {
    if (req.method !== "GET") {
      methodNotAllowed(res, "GET");
      return;
    }
    json(res, 200, {
      ok: true,
      workers: subAgentManager?.listWorkers() || [],
      tasks: subAgentManager?.listTasks() || [],
    });
  }

  async function handleSubAgentCallbackApi(req, res) {
    if (req.method !== "POST") {
      methodNotAllowed(res, "POST");
      return;
    }
    if (!subAgentManager) {
      json(res, 503, { ok: false, error: "Sub-agent support is not configured." });
      return;
    }
    try {
      const payload = JSON.parse(await readRequestBody(req, 1_000_000) || "{}");
      const result = subAgentManager.receiveCallback(req.headers.authorization, payload);
      json(res, result.status, result.body);
    } catch (error) {
      json(res, 400, { ok: false, error: error.message });
    }
  }

  return {
    "/api/sub-agents": handleSubAgentsApi,
    "/api/sub-agents/callback": handleSubAgentCallbackApi,
  };
}
