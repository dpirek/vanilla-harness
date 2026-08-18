import { jsonOptions, requestJson } from "./api-client.js";

async function loadUiState() {
  const payload = await requestJson("/api/ui-state", {}, "Unable to load UI state.");
  return payload.state || {};
}

async function saveUiState(state) {
  return requestJson("/api/ui-state", jsonOptions("PUT", { state }, { keepalive: true }), "Unable to save UI state.");
}

export { loadUiState, saveUiState };
