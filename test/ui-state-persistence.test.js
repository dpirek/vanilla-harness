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
    store.set({ sessions: [session] });
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
    assert.equal(Object.hasOwn(restored, "activeSessionId"), false);
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
    CREATE TABLE rig_configurations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      component_state TEXT NOT NULL,
      system_prompts TEXT NOT NULL,
      tool_permissions TEXT NOT NULL,
      mcp_config TEXT NOT NULL DEFAULT '',
      updated_at INTEGER NOT NULL,
      sort_order INTEGER NOT NULL,
      selected INTEGER NOT NULL DEFAULT 0 CHECK (selected IN (0, 1))
    ) STRICT;
    CREATE TABLE layout (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      active_session_id TEXT,
      sidebar_collapsed INTEGER NOT NULL DEFAULT 0 CHECK (sidebar_collapsed IN (0, 1))
    ) STRICT;
    INSERT INTO layout (id, active_session_id, sidebar_collapsed)
      VALUES (1, 'legacy-session', 1);
    CREATE TABLE tool_permissions (
      name TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL CHECK (enabled IN (0, 1))
    ) STRICT;
    INSERT INTO tool_permissions (name, enabled) VALUES ('read_file', 1);
  `);
  legacy.prepare(`
    INSERT INTO skills (id, name, source_path, content, selected, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run("legacy-skill", "legacy-skill", "/previous/location/SKILL.md", "legacy content", 1, 10);
  legacy.prepare(`
    INSERT INTO rig_configurations
      (id, name, component_state, system_prompts, tool_permissions, mcp_config, updated_at, sort_order, selected)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run("legacy-preset", "Legacy preset", "{}", "{}", '{"read_file":false}', "", 10, 0, 1);
  legacy.close();

  let store;
  try {
    store = createUiStateStore(databasePath);
    assert.equal(store.getAll().toolPermissions.read_file, false);
    store.set({ toolPermissions: { run_command: false } });
    assert.equal(
      store.getRigConfigurations().configurations.find((configuration) => configuration.selected)
        .toolPermissions.run_command,
      false,
    );
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
    const activePreset = store.getRigConfigurations().configurations.find((configuration) => configuration.selected);
    assert.deepEqual(activePreset.skillIds, [created.skill.id]);

    const alternatePreset = {
      ...structuredClone(activePreset),
      id: "alternate-preset",
      name: "Alternate preset",
      skillIds: ["legacy-skill"],
      selected: true,
    };
    store.setRigConfigurations(
      [{ ...activePreset, selected: false }, alternatePreset],
      alternatePreset.id,
    );
    assert.deepEqual(store.getSelectedSkills().map((skill) => skill.id), ["legacy-skill"]);
    store.close();
    store = null;

    store = createUiStateStore(databasePath);
    assert.equal(store.getSelectedSkills()[0].name, "legacy-skill");
    assert.deepEqual(
      store.getRigConfigurations().configurations.find((configuration) => configuration.selected).skillIds,
      ["legacy-skill"],
    );
    store.close();
    store = null;

    const database = new DatabaseSync(databasePath);
    const columns = database.prepare("SELECT name FROM pragma_table_info('skills')").all()
      .map(({ name }) => name);
    const presetColumns = database.prepare("SELECT name FROM pragma_table_info('presets')").all()
      .map(({ name }) => name);
    const legacyPresetTable = database.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'rig_configurations'",
    ).get();
    const legacyLayoutTable = database.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'layout'",
    ).get();
    const legacyToolPermissionsTable = database.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'tool_permissions'",
    ).get();
    database.close();
    assert.deepEqual(columns, ["id", "name", "content", "selected", "updated_at"]);
    assert.ok(presetColumns.includes("skill_ids"));
    assert.equal(legacyPresetTable, undefined);
    assert.equal(legacyLayoutTable, undefined);
    assert.equal(legacyToolPermissionsTable, undefined);
  } finally {
    store?.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
