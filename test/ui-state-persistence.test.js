import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { createUiStateStore } from "../lib/ui-state.js";
import { skillDraft } from "../public/lib/skill-content.js";

test("SQLite preserves discovered models for each provider", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ai-harness-provider-models-"));
  const databasePath = path.join(directory, "providers.sqlite");
  let store;
  try {
    store = createUiStateStore(databasePath);
    store.set({ providers: [{
      id: "openai-primary",
      name: "OpenAI",
      type: "openai",
      model: "gpt-5",
      models: [
        "gpt-5",
        "gpt-4.1",
        { id: "gpt-5", throughput: 42.5, latency: 310, testedAt: 67890 },
      ],
      modelsLoadedAt: 12345,
      baseUrl: "",
      apiKey: "secret",
      selected: true,
    }] });
    store.close();
    store = createUiStateStore(databasePath);
    assert.deepEqual(store.getProviders()[0].models, [
      { id: "gpt-5", throughput: 42.5, latency: 310, testedAt: 67890 },
      "gpt-4.1",
    ]);
    assert.equal(store.getProviders()[0].modelsLoadedAt, 12345);
  } finally {
    store?.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("SQLite stores complete task rating snapshots and supports rating updates", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ai-harness-task-ratings-"));
  const databasePath = path.join(directory, "ratings.sqlite");
  let store;
  try {
    store = createUiStateStore(databasePath);
    const record = {
      runId: "run-1",
      sessionId: "session-1",
      providerId: "provider-1",
      providerName: "OpenAI",
      model: "gpt-5",
      inputPrompt: "Build the feature",
      presetSettings: { id: "preset-1", toolPermissions: { read_file: true } },
      tools: { enabled: ["read_file"], mcpConfig: "[mcp_servers.example]" },
      systemPrompts: { coding: "Write maintainable code." },
      cost: 0.0125,
      rating: 4,
    };
    store.setTaskRating(record);
    store.setTaskRating({ ...record, rating: 5 });
    store.close();
    store = createUiStateStore(databasePath);

    const [summary] = store.getTaskRatings();
    assert.equal(summary.rating, 5);
    assert.equal(summary.cost, 0.0125);
    const [full] = store.getTaskRatings({ full: true });
    assert.equal(full.inputPrompt, "Build the feature");
    assert.deepEqual(full.presetSettings, record.presetSettings);
    assert.deepEqual(full.tools, record.tools);
    assert.deepEqual(full.systemPrompts, record.systemPrompts);
  } finally {
    store?.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

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

test("SQLite skills migrate to /skills folders and presets keep their selections", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ai-harness-skills-"));
  const databasePath = path.join(directory, "skills.sqlite");
  const oldSkillFolder = path.join(directory, "old-skill");
  await fs.mkdir(path.join(oldSkillFolder, "scripts"), { recursive: true });
  await fs.writeFile(path.join(oldSkillFolder, "SKILL.md"), "legacy content");
  await fs.writeFile(path.join(oldSkillFolder, "scripts/check.js"), "const migrated = true;\n");
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
  `).run("legacy-skill", "legacy-skill", path.join(oldSkillFolder, "SKILL.md"), "legacy content", 1, 10);
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
    assert.equal(store.getSkills()[0].id, "legacy-skill");
    assert.equal(store.getSkills()[0].selected, true);
    assert.match(store.getSkills()[0].content, /legacy content/);
    assert.equal(await fs.readFile(path.join(directory, "skills/legacy-skill/SKILL.md"), "utf8"), store.getSkills()[0].content);
    assert.equal(await fs.readFile(path.join(directory, "skills/legacy-skill/scripts/check.js"), "utf8"), "const migrated = true;\n");

    const created = store.createSkill({ name: "new-skill", content: skillDraft("new-skill") });
    assert.equal(created.skill.name, "new-skill");
    const updated = store.updateSkill(created.skill.id, {
      name: "renamed-skill",
      content: skillDraft("renamed-skill").replace("Describe the exact workflow the agent should follow.", "Updated content."),
    });
    assert.equal(updated.skill.name, "renamed-skill");
    assert.match(updated.skill.content, /Updated content/);
    store.setSelectedSkills([updated.skill.id], false);
    const activePreset = store.getRigConfigurations().configurations.find((configuration) => configuration.selected);
    assert.deepEqual(activePreset.skillIds, [updated.skill.id]);
    assert.equal(activePreset.skillAutoDiscovery, false);

    const alternatePreset = {
      ...structuredClone(activePreset),
      id: "alternate-preset",
      name: "Alternate preset",
      skillIds: ["legacy-skill"],
      skillAutoDiscovery: true,
      subAgents: [{ name: "reviewer", url: "http://localhost:3001/" }],
      selected: true,
    };
    store.setRigConfigurations(
      [{ ...activePreset, selected: false }, alternatePreset],
      alternatePreset.id,
    );
    assert.deepEqual(store.getSelectedSkills().map((skill) => skill.id), ["legacy-skill"]);
    assert.equal(store.getSkillAutoDiscovery(), true);
    store.close();
    store = null;

    store = createUiStateStore(databasePath);
    assert.equal(store.getSelectedSkills()[0].name, "legacy-skill");
    assert.deepEqual(
      store.getRigConfigurations().configurations.find((configuration) => configuration.selected).skillIds,
      ["legacy-skill"],
    );
    assert.equal(store.getRigConfigurations().configurations.find((configuration) => configuration.id === activePreset.id).skillAutoDiscovery, false);
    assert.deepEqual(
      store.getRigConfigurations().configurations.find((configuration) => configuration.selected).subAgents,
      [{ name: "reviewer", url: "http://localhost:3001" }],
    );
    store.close();
    store = null;

    const database = new DatabaseSync(databasePath);
    const columns = database.prepare("SELECT name FROM pragma_table_info('skills_legacy_archive')").all()
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
    const activeSkillsTable = database.prepare("SELECT name FROM sqlite_master WHERE name = 'skills'").get();
    database.close();
    assert.deepEqual(columns, ["id", "name", "content", "selected", "updated_at"]);
    assert.equal(activeSkillsTable, undefined);
    assert.ok(presetColumns.includes("skill_ids"));
    assert.ok(presetColumns.includes("skill_auto_discovery"));
    assert.ok(presetColumns.includes("sub_agents"));
    assert.equal(legacyPresetTable, undefined);
    assert.equal(legacyLayoutTable, undefined);
    assert.equal(legacyToolPermissionsTable, undefined);
  } finally {
    store?.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
