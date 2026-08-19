import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
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

test("SQLite is the sole skill store and removes the legacy source column", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ai-harness-skills-"));
  const databasePath = path.join(directory, "skills.sqlite");
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`
    CREATE TABLE skills (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      source_path TEXT NOT NULL UNIQUE,
      content TEXT NOT NULL,
      selected INTEGER NOT NULL DEFAULT 0 CHECK (selected IN (0, 1)),
      updated_at INTEGER NOT NULL
    ) STRICT;
  `);
  legacy.prepare(`
    INSERT INTO skills (id, name, source_path, content, selected, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run("legacy-skill", "legacy-skill", "/previous/location/SKILL.md", "legacy content", 1, 10);
  legacy.close();

  let store;
  try {
    store = createUiStateStore(databasePath);
    assert.deepEqual(store.getSkills(), [{
      id: "legacy-skill",
      name: "legacy-skill",
      content: "legacy content",
      selected: true,
      updatedAt: 10,
    }]);

    const created = store.createSkill({ name: "new-skill", content: "new content" });
    assert.equal(created.skill.name, "new-skill");
    const updated = store.updateSkill(created.skill.id, {
      name: "renamed-skill",
      content: "updated content",
    });
    assert.equal(updated.skill.name, "renamed-skill");
    assert.equal(updated.skill.content, "updated content");
    store.setSelectedSkills([created.skill.id]);
    store.close();
    store = null;

    store = createUiStateStore(databasePath);
    assert.equal(store.getSelectedSkills()[0].name, "renamed-skill");
    store.close();
    store = null;

    const database = new DatabaseSync(databasePath);
    const columns = database.prepare("SELECT name FROM pragma_table_info('skills')").all()
      .map(({ name }) => name);
    database.close();
    assert.deepEqual(columns, ["id", "name", "content", "selected", "updated_at"]);
  } finally {
    store?.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
