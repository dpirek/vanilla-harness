import assert from "node:assert/strict";
import test from "node:test";

import { saveUiState } from "../public/services/ui-state-api.js";

test("conversation saves are not constrained by the browser keepalive body limit", async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const largeStepDetail = "x".repeat(100_000);
    await saveUiState({ sessions: [{
      id: "session-1",
      messages: [{ role: "agent", text: "Final response" }],
      events: [{ title: "Model turn 1", detail: largeStepDetail }],
    }] });

    assert.equal(request.url, "/api/ui-state");
    assert.equal(request.options.keepalive, undefined);
    assert.ok(request.options.body.length > 100_000);
    assert.equal(JSON.parse(request.options.body).state.sessions[0].messages[0].text, "Final response");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
