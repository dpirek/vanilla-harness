import assert from "node:assert/strict";
import test from "node:test";

import { createApiRouter } from "../api/index.js";

function responseRecorder() {
  return {
    body: undefined,
    headers: undefined,
    status: undefined,
    writeHead(status, headers) {
      this.status = status;
      this.headers = headers;
    },
    end(body) {
      this.body = body;
    },
  };
}

test("API router delegates every registered endpoint and falls through for unknown paths", async () => {
  const router = createApiRouter({
    defaultWorkspace: "/workspace",
    resolveWorkspace: async (workspace) => workspace,
    uiStateStore: {
      getSelectedProvider: () => ({ apiKey: "configured" }),
    },
  });
  const paths = [
    "/api/health",
    "/api/config",
    "/api/models",
    "/api/ui-state",
    "/api/rig-configurations",
    "/api/system-prompts",
    "/api/skills",
    "/api/workspace-tree",
    "/api/workspace-folder",
    "/api/workspace-upload",
    "/api/conversation-workspace",
    "/api/workspace-file",
    "/api/workspace-file-asset",
    "/api/workspace-recording",
    "/api/workspace-transcription",
  ];

  for (const pathname of paths) {
    const response = responseRecorder();
    const handled = await router(
      { method: "TRACE", headers: {} },
      response,
      new URL(pathname, "http://localhost"),
    );
    assert.equal(handled, true, pathname);
    assert.ok(response.status, pathname);
  }

  const response = responseRecorder();
  assert.equal(await router(
    { method: "GET", headers: {} },
    response,
    new URL("/api/unknown", "http://localhost"),
  ), false);
  assert.equal(response.status, undefined);
});
