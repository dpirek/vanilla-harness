import assert from "node:assert/strict";
import test from "node:test";

import { clearSessionHistory } from "../public/lib/sessions.js";

test("clearing chat history also removes step summary events and token usage", () => {
  const session = {
    title: "Existing chat",
    messages: [{ role: "agent", text: "Final response" }],
    events: [{ title: "Prompt sent", timestamp: 1 }],
    tokenHistory: [{ totalTokens: 42 }],
    workspace: "/workspace",
    updatedAt: 1,
  };

  assert.equal(clearSessionHistory(session, 10), session);
  assert.equal(session.title, "New chat");
  assert.deepEqual(session.messages, []);
  assert.deepEqual(session.events, []);
  assert.deepEqual(session.tokenHistory, []);
  assert.equal(session.updatedAt, 10);
  assert.equal(session.workspace, "/workspace");
});
