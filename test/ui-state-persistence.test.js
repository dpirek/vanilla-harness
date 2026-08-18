import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createUiStateStore } from "../lib/ui-state.js";

test("SQLite preserves conversation messages and step events across reopen", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ai-harness-history-"));
  const databasePath = path.join(directory, "history.sqlite");
  const session = {
    id: "session-1",
    title: "Persistent conversation",
    workspace: "/workspace",
    messages: [
      { role: "user", text: "Question" },
      { role: "agent", text: "Final response" },
    ],
    events: [
      { title: "Prompt sent", detail: "Question", timestamp: 1 },
      {
        title: "Model turn 1",
        detail: {
          type: "turn",
          turn: 1,
          serverResponse: { usage: { input_tokens: 20, output_tokens: 8 } },
        },
        timestamp: 2,
      },
      { title: "Response completed", detail: { type: "response_complete" }, timestamp: 3 },
    ],
    tokenHistory: [],
    updatedAt: 3,
  };

  let store;
  try {
    store = createUiStateStore(databasePath);
    store.set({ sessions: [session], activeSessionId: session.id });
    store.close();
    store = null;

    store = createUiStateStore(databasePath);
    const restored = store.getAll();
    assert.deepEqual(restored.sessions[0].messages, session.messages);
    assert.equal(restored.sessions[0].events.length, 3);
    assert.deepEqual(restored.sessions[0].events[1].detail.serverResponse.usage, {
      input_tokens: 20,
      output_tokens: 8,
    });
    assert.equal(restored.activeSessionId, session.id);
  } finally {
    store?.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
