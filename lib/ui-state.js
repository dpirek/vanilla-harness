import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { DEFAULT_SYSTEM_PROMPTS, SYSTEM_PROMPT_TITLES } from "./system-prompts.js";
import { defaultModelForProvider, normalizeProvider } from "./provider-config.js";

const ALLOWED_KEYS = new Set([
  "sessions",
  "providerSettings",
  "providers",
  "toolPermissions",
]);

const DEFAULT_TOOL_PERMISSIONS = {
  list_files: true,
  read_file: true,
  write_file: true,
  search_files: true,
  curl: true,
  run_command: true,
};

const RIG_EFFECT_KEYS = ["composer", "tools", "mcp", "validation"];
const DEFAULT_PROVIDER_SETTINGS = {
  provider: "openai",
  model: "gpt-5.1-codex",
  baseUrl: "",
  apiKey: "",
};

function normalizeRigModelDisplay(value) {
  return value === "synth" ? "synth" : "engine";
}

function normalizeStoredToolPermissions(value = {}) {
  return Object.fromEntries(
    Object.entries(DEFAULT_TOOL_PERMISSIONS).map(([name, defaultValue]) => [
      name,
      typeof value[name] === "boolean" ? value[name] : defaultValue,
    ]),
  );
}

function normalizeRigComponentState(value = {}) {
  const effects = Object.fromEntries(RIG_EFFECT_KEYS.map((key) => [
    key,
    value?.effects?.[key] !== false,
  ]));
  return {
    inputSource: value?.inputSource === "keyboard" ? "keyboard" : "microphone",
    modelDisplay: normalizeRigModelDisplay(value?.modelDisplay),
    effects,
  };
}

function normalizeRigSystemPrompts(value = {}) {
  return Object.fromEntries(Object.entries(DEFAULT_SYSTEM_PROMPTS).map(([key, defaultValue]) => [
    key,
    typeof value?.[key] === "string" ? value[key] : defaultValue,
  ]));
}

function normalizeRigProviderSettings(value = {}, fallback = DEFAULT_PROVIDER_SETTINGS) {
  const provider = normalizeProvider(value?.provider || value?.type || fallback?.provider || fallback?.type);
  const fallbackProvider = normalizeProvider(fallback?.provider || fallback?.type || provider);
  const fallbackModel = typeof fallback?.model === "string" ? fallback.model.trim() : "";
  const model = typeof value?.model === "string" && value.model.trim()
    ? value.model.trim()
    : fallbackModel && fallbackProvider === provider
      ? fallbackModel
      : defaultModelForProvider(provider);
  return {
    provider,
    model,
    baseUrl: typeof value?.baseUrl === "string" ? value.baseUrl : String(fallback?.baseUrl || ""),
    apiKey: typeof value?.apiKey === "string" ? value.apiKey : String(fallback?.apiKey || ""),
  };
}

function normalizeRigConfiguration(config = {}, index = 0) {
  return {
    id: String(config.id || crypto.randomUUID()),
    name: String(config.name || `Preset ${index + 1}`),
    componentState: normalizeRigComponentState(config.componentState),
    systemPrompts: normalizeRigSystemPrompts(config.systemPrompts),
    providerSettings: normalizeRigProviderSettings(config.providerSettings),
    toolPermissions: normalizeStoredToolPermissions(config.toolPermissions),
    skillIds: [...new Set((Array.isArray(config.skillIds) ? config.skillIds : []).map((id) => String(id)))],
    mcpConfig: String(config.mcpConfig || ""),
    updatedAt: Number(config.updatedAt) || Date.now(),
    selected: config.selected === true,
  };
}

export function createUiStateStore(databasePath) {
  const database = new DatabaseSync(databasePath);
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
  `);

  const sessionColumns = database.prepare(
    "SELECT name FROM pragma_table_info('sessions')",
  ).all().map(({ name }) => name);
  if (sessionColumns.includes("messages") || sessionColumns.includes("events")) {
    database.exec("ALTER TABLE sessions RENAME TO sessions_legacy_json");
  }
  const providerColumns = database.prepare(
    "SELECT name FROM pragma_table_info('providers')",
  ).all().map(({ name }) => name);
  if (providerColumns.includes("provider") && !providerColumns.includes("id")) {
    database.exec(`
      ALTER TABLE providers RENAME TO providers_legacy_single;
      ALTER TABLE provider_settings RENAME TO provider_settings_legacy_single;
    `);
  }
  const hasLegacyPresetTable = database.prepare(
    "SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'rig_configurations'",
  ).get()?.present === 1;
  const hasPresetTable = database.prepare(
    "SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'presets'",
  ).get()?.present === 1;
  if (hasLegacyPresetTable && !hasPresetTable) {
    database.exec("ALTER TABLE rig_configurations RENAME TO presets");
  }
  database.exec("DROP TABLE IF EXISTS layout; DROP TABLE IF EXISTS tool_permissions");

  database.exec(`

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      workspace TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      sort_order INTEGER NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS messages (
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      message_order INTEGER NOT NULL,
      role TEXT NOT NULL,
      text TEXT NOT NULL,
      images TEXT NOT NULL DEFAULT '[]',
      PRIMARY KEY (session_id, message_order)
    ) STRICT, WITHOUT ROWID;

    CREATE TABLE IF NOT EXISTS events (
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      event_order INTEGER NOT NULL,
      title TEXT NOT NULL,
      detail TEXT,
      input_prompt TEXT,
      server_response TEXT,
      timestamp INTEGER NOT NULL,
      PRIMARY KEY (session_id, event_order)
    ) STRICT, WITHOUT ROWID;

    CREATE TABLE IF NOT EXISTS token_usage (
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      prompt_order INTEGER NOT NULL,
      prompt_id TEXT NOT NULL,
      prompt_text TEXT NOT NULL,
      input_tokens INTEGER NOT NULL,
      output_tokens INTEGER NOT NULL,
      total_tokens INTEGER NOT NULL,
      timestamp INTEGER NOT NULL,
      PRIMARY KEY (session_id, prompt_order)
    ) STRICT, WITHOUT ROWID;

    CREATE TABLE IF NOT EXISTS providers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('openai', 'ollama', 'custom')),
      base_url TEXT NOT NULL DEFAULT '',
      api_key TEXT NOT NULL DEFAULT '',
      updated_at INTEGER NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS provider_settings (
      provider_id TEXT PRIMARY KEY REFERENCES providers(id) ON DELETE CASCADE,
      model TEXT NOT NULL DEFAULT '',
      selected INTEGER NOT NULL DEFAULT 0 CHECK (selected IN (0, 1)),
      updated_at INTEGER NOT NULL
    ) STRICT;

    CREATE UNIQUE INDEX IF NOT EXISTS one_selected_provider
      ON provider_settings(selected) WHERE selected = 1;

    CREATE TABLE IF NOT EXISTS mcp_configuration (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      content TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS system_prompts (
      key TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS skills (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      content TEXT NOT NULL,
      selected INTEGER NOT NULL DEFAULT 0 CHECK (selected IN (0, 1)),
      updated_at INTEGER NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS presets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      component_state TEXT NOT NULL,
      system_prompts TEXT NOT NULL,
      provider_settings TEXT NOT NULL DEFAULT '{}',
      tool_permissions TEXT NOT NULL,
      skill_ids TEXT NOT NULL DEFAULT '[]',
      mcp_config TEXT NOT NULL DEFAULT '',
      updated_at INTEGER NOT NULL,
      sort_order INTEGER NOT NULL,
      selected INTEGER NOT NULL DEFAULT 0 CHECK (selected IN (0, 1))
    ) STRICT;

    DROP INDEX IF EXISTS one_selected_rig_configuration;
    CREATE UNIQUE INDEX IF NOT EXISTS one_selected_preset
      ON presets(selected) WHERE selected = 1;

  `);
  const seedPrompt = database.prepare(
    "INSERT OR IGNORE INTO system_prompts (key, title, content, updated_at) VALUES (?, ?, ?, ?)",
  );
  for (const [key, content] of Object.entries(DEFAULT_SYSTEM_PROMPTS)) {
    seedPrompt.run(key, SYSTEM_PROMPT_TITLES[key], content, Date.now());
  }

  const eventColumns = database.prepare(
    "SELECT name FROM pragma_table_info('events')",
  ).all().map(({ name }) => name);
  if (!eventColumns.includes("input_prompt")) database.exec("ALTER TABLE events ADD COLUMN input_prompt TEXT");
  if (!eventColumns.includes("server_response")) database.exec("ALTER TABLE events ADD COLUMN server_response TEXT");
  const presetColumns = database.prepare(
    "SELECT name FROM pragma_table_info('presets')",
  ).all().map(({ name }) => name);
  if (!presetColumns.includes("provider_settings")) {
    database.exec("ALTER TABLE presets ADD COLUMN provider_settings TEXT NOT NULL DEFAULT '{}'");
  }
  const addedPresetSkillIds = !presetColumns.includes("skill_ids");
  if (addedPresetSkillIds) {
    database.exec("ALTER TABLE presets ADD COLUMN skill_ids TEXT NOT NULL DEFAULT '[]'");
  }
  const skillColumns = database.prepare(
    "SELECT name FROM pragma_table_info('skills')",
  ).all().map(({ name }) => name);
  if (skillColumns.includes("source_path")) {
    database.exec(`
      BEGIN IMMEDIATE;
      DROP TABLE IF EXISTS skills_without_source;
      CREATE TABLE skills_without_source (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        content TEXT NOT NULL,
        selected INTEGER NOT NULL DEFAULT 0 CHECK (selected IN (0, 1)),
        updated_at INTEGER NOT NULL
      ) STRICT;
      INSERT INTO skills_without_source (id, name, content, selected, updated_at)
        SELECT id, name, content, selected, updated_at FROM skills;
      DROP TABLE skills;
      ALTER TABLE skills_without_source RENAME TO skills;
      COMMIT;
    `);
  }
  if (addedPresetSkillIds) {
    const selectedSkillIds = database.prepare("SELECT id FROM skills WHERE selected = 1 ORDER BY id")
      .all().map(({ id }) => id);
    database.prepare("UPDATE presets SET skill_ids = ?").run(JSON.stringify(selectedSkillIds));
  }

  const replaceSession = database.prepare(`
    INSERT INTO sessions (id, title, workspace, updated_at, sort_order)
    VALUES (?, ?, ?, ?, ?)
  `);
  const insertMessage = database.prepare(`
    INSERT INTO messages (session_id, message_order, role, text, images) VALUES (?, ?, ?, ?, ?)
  `);
  const insertEvent = database.prepare(`
    INSERT INTO events
      (session_id, event_order, title, detail, input_prompt, server_response, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertTokenUsage = database.prepare(`
    INSERT INTO token_usage
      (session_id, prompt_order, prompt_id, prompt_text, input_tokens, output_tokens, total_tokens, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const upsertProvider = database.prepare(`
    INSERT INTO providers (id, name, type, base_url, api_key, updated_at) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, type = excluded.type,
      base_url = excluded.base_url, api_key = excluded.api_key, updated_at = excluded.updated_at
  `);
  const updateProviderSettings = database.prepare(`
    INSERT INTO provider_settings (provider_id, model, selected, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(provider_id) DO UPDATE SET model = excluded.model,
      selected = excluded.selected, updated_at = excluded.updated_at
  `);
  const insertPreset = database.prepare(`
    INSERT INTO presets
      (id, name, component_state, system_prompts, provider_settings, tool_permissions, skill_ids, mcp_config, updated_at, sort_order, selected)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const readPresetRows = database.prepare(`
    SELECT id, name, component_state, system_prompts, provider_settings, tool_permissions, skill_ids, mcp_config, updated_at, selected
    FROM presets ORDER BY sort_order
  `);
  const upsertMcpConfiguration = database.prepare(`
    INSERT INTO mcp_configuration (id, content, updated_at) VALUES (1, ?, ?)
    ON CONFLICT(id) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at
  `);
  const updateSystemPromptContent = database.prepare(`
    UPDATE system_prompts SET content = ?, updated_at = ? WHERE key = ?
  `);
  const insertSkill = database.prepare(`
    INSERT INTO skills (id, name, content, selected, updated_at)
    VALUES (?, ?, ?, 0, ?)
  `);
  const updateSkill = database.prepare(`
    UPDATE skills SET name = ?, content = ?, updated_at = ? WHERE id = ?
  `);
  const clearSelectedSkills = database.prepare("UPDATE skills SET selected = 0");
  const selectSkill = database.prepare("UPDATE skills SET selected = 1 WHERE id = ?");

  const readSkills = () => database.prepare(`
    SELECT id, name, content, selected, updated_at
    FROM skills
    ORDER BY selected DESC, lower(name), id
  `).all().map((row) => ({
    id: row.id,
    name: row.name,
    content: row.content,
    selected: row.selected === 1,
    updatedAt: row.updated_at,
  }));

  const readCurrentProviderSettings = () => {
    const provider = database.prepare(`
      SELECT p.type, p.base_url, p.api_key, ps.model
      FROM providers p JOIN provider_settings ps ON ps.provider_id = p.id
      WHERE ps.selected = 1
      LIMIT 1
    `).get();
    return normalizeRigProviderSettings(provider
      ? {
        provider: provider.type,
        model: provider.model,
        baseUrl: provider.base_url,
        apiKey: provider.api_key,
      }
      : {});
  };

  const readProviders = () => database.prepare(`
    SELECT p.id, p.name, p.type, p.base_url, p.api_key, ps.model, ps.selected
    FROM providers p JOIN provider_settings ps ON ps.provider_id = p.id
    ORDER BY ps.selected DESC, p.name
  `).all().map((row) => ({
    id: row.id,
    name: row.name,
    type: row.type,
    model: row.model,
    baseUrl: row.base_url,
    apiKey: row.api_key,
    selected: row.selected === 1,
  }));

  const matchingProviderId = (settings) => {
    const normalized = normalizeRigProviderSettings(settings, readCurrentProviderSettings());
    const providers = readProviders();
    const exact = providers.find((provider) => (
      provider.type === normalized.provider &&
      provider.model === normalized.model &&
      provider.baseUrl === normalized.baseUrl &&
      provider.apiKey === normalized.apiKey
    ));
    if (exact) return exact.id;
    const sameConnection = providers.find((provider) => (
      provider.type === normalized.provider &&
      provider.baseUrl === normalized.baseUrl &&
      provider.apiKey === normalized.apiKey
    ));
    if (sameConnection) return sameConnection.id;
    return normalized.provider;
  };

  const setCurrentProviderSettings = (settings, now = Date.now()) => {
    const normalized = normalizeRigProviderSettings(settings, readCurrentProviderSettings());
    const providerId = matchingProviderId(normalized);
    const existing = readProviders().find((provider) => provider.id === providerId);
    database.exec("UPDATE provider_settings SET selected = 0");
    upsertProvider.run(
      providerId,
      existing?.name || normalized.provider,
      normalized.provider,
      normalized.baseUrl,
      normalized.apiKey,
      now,
    );
    updateProviderSettings.run(providerId, normalized.model, 1, now);
    return normalized;
  };

  const readPresets = () => readPresetRows.all().map((row) => ({
    id: row.id,
    name: row.name,
    componentState: normalizeRigComponentState(JSON.parse(row.component_state)),
    systemPrompts: normalizeRigSystemPrompts(JSON.parse(row.system_prompts)),
    providerSettings: normalizeRigProviderSettings(JSON.parse(row.provider_settings), readCurrentProviderSettings()),
    toolPermissions: normalizeStoredToolPermissions(JSON.parse(row.tool_permissions)),
    skillIds: [...new Set(JSON.parse(row.skill_ids).map((id) => String(id)))],
    mcpConfig: row.mcp_config || "",
    updatedAt: row.updated_at,
    selected: row.selected === 1,
  }));

  const applyRigConfigurationSnapshot = (configuration, { syncProviderSettings = true } = {}) => {
    if (!configuration) return;
    const prompts = normalizeRigSystemPrompts(configuration.systemPrompts);
    for (const [key, content] of Object.entries(prompts)) {
      updateSystemPromptContent.run(String(content), Date.now(), key);
    }
    if (syncProviderSettings) setCurrentProviderSettings(configuration.providerSettings, Date.now());
    const knownSkillIds = new Set(readSkills().map((skill) => skill.id));
    clearSelectedSkills.run();
    configuration.skillIds.filter((id) => knownSkillIds.has(id)).forEach((id) => selectSkill.run(id));
    upsertMcpConfiguration.run(String(configuration.mcpConfig || ""), Date.now());
  };

  const buildDefaultRigConfiguration = (name = "Default") => ({
    id: crypto.randomUUID(),
    name,
    componentState: normalizeRigComponentState(),
    systemPrompts: normalizeRigSystemPrompts(
      Object.fromEntries(database.prepare("SELECT key, content FROM system_prompts").all().map(({ key, content }) => [key, content])),
    ),
    providerSettings: readCurrentProviderSettings(),
    toolPermissions: normalizeStoredToolPermissions(),
    skillIds: readSkills().filter((skill) => skill.selected).map((skill) => skill.id),
    mcpConfig: database.prepare("SELECT content FROM mcp_configuration WHERE id = 1").get()?.content || "",
    updatedAt: Date.now(),
    selected: true,
  });

  const replaceRigConfigurations = (configurations = [], activeConfigurationId = null, options = {}) => {
    const currentProviderSettings = readCurrentProviderSettings();
    const currentSkillIds = readSkills().filter((skill) => skill.selected).map((skill) => skill.id);
    const knownSkillIds = new Set(readSkills().map((skill) => skill.id));
    const normalized = (Array.isArray(configurations) && configurations.length
      ? configurations.map((configuration, index) => normalizeRigConfiguration({
        ...configuration,
        providerSettings: configuration?.providerSettings || currentProviderSettings,
        skillIds: Array.isArray(configuration?.skillIds) ? configuration.skillIds : currentSkillIds,
      }, index))
      : [buildDefaultRigConfiguration()]).map((configuration, index) => ({
      ...configuration,
      skillIds: configuration.skillIds.filter((id) => knownSkillIds.has(id)),
      selected: configuration.selected === true && activeConfigurationId == null ? true : false,
      sortOrder: index,
    }));
    const effectiveActiveConfigurationId = normalized.some((configuration) => configuration.id === activeConfigurationId)
      ? String(activeConfigurationId)
      : normalized.find((configuration) => configuration.selected)?.id || normalized[0].id;
    database.exec("DELETE FROM presets");
    normalized.forEach((configuration, index) => {
      insertPreset.run(
        configuration.id,
        configuration.name,
        JSON.stringify(configuration.componentState),
        JSON.stringify(configuration.systemPrompts),
        JSON.stringify(normalizeRigProviderSettings(configuration.providerSettings, readCurrentProviderSettings())),
        JSON.stringify(configuration.toolPermissions),
        JSON.stringify(configuration.skillIds),
        configuration.mcpConfig,
        Number(configuration.updatedAt) || Date.now(),
        index,
        configuration.id === effectiveActiveConfigurationId ? 1 : 0,
      );
    });
    applyRigConfigurationSnapshot(
      normalized.find((configuration) => configuration.id === effectiveActiveConfigurationId),
      options,
    );
    return {
      configurations: normalized.map(({ sortOrder, ...configuration }) => ({
        ...configuration,
        selected: configuration.id === effectiveActiveConfigurationId,
      })),
      activeConfigurationId: effectiveActiveConfigurationId,
    };
  };

  function writeValues(values) {
    const entries = Object.entries(values || {}).filter(([key]) => ALLOWED_KEYS.has(key));
    if (entries.length === 0) throw new Error("No valid UI state keys were provided.");
    const now = Date.now();
    if (Object.hasOwn(values, "sessions")) {
      database.exec("DELETE FROM sessions");
      for (const [index, session] of (Array.isArray(values.sessions) ? values.sessions : []).entries()) {
        replaceSession.run(
          String(session.id),
          String(session.title || "New chat"),
          String(session.workspace || "."),
          Number(session.updatedAt) || now,
          index,
        );
        for (const [messageOrder, message] of (Array.isArray(session.messages) ? session.messages : []).entries()) {
          insertMessage.run(
            String(session.id), messageOrder, String(message.role || "user"), String(message.text || ""),
            JSON.stringify(Array.isArray(message.images) ? message.images : []),
          );
        }
        for (const [eventOrder, event] of (Array.isArray(session.events) ? session.events : []).entries()) {
          const eventDetail = event.detail && typeof event.detail === "object"
            ? { ...event.detail }
            : event.detail;
          const inputPrompt = eventDetail?.inputPrompt;
          const serverResponse = eventDetail?.serverResponse;
          if (eventDetail && typeof eventDetail === "object") {
            delete eventDetail.inputPrompt;
            delete eventDetail.serverResponse;
          }
          insertEvent.run(
            String(session.id), eventOrder, String(event.title || "Event"),
            eventDetail === undefined ? null : JSON.stringify(eventDetail),
            inputPrompt === undefined ? null : JSON.stringify(inputPrompt),
            serverResponse === undefined ? null : JSON.stringify(serverResponse),
            Number(event.timestamp) || now,
          );
        }
        for (const [promptOrder, entry] of (Array.isArray(session.tokenHistory) ? session.tokenHistory : []).entries()) {
          const inputTokens = Math.max(0, Number(entry.inputTokens) || 0);
          const outputTokens = Math.max(0, Number(entry.outputTokens) || 0);
          insertTokenUsage.run(
            String(session.id),
            promptOrder,
            String(entry.id || `${session.id}-${promptOrder}`),
            String(entry.prompt || ""),
            inputTokens,
            outputTokens,
            Math.max(0, Number(entry.totalTokens) || (inputTokens + outputTokens)),
            Number(entry.timestamp) || now,
          );
        }
      }
    }
    if (Array.isArray(values.providers)) {
      database.exec("DELETE FROM provider_settings; DELETE FROM providers");
      for (const item of values.providers) {
        const id = String(item.id);
        upsertProvider.run(id, String(item.name || item.type || "Provider"), String(item.type || "openai"),
          String(item.baseUrl || ""), String(item.apiKey || ""), now);
        updateProviderSettings.run(id, String(item.model || ""), item.selected === true ? 1 : 0, now);
      }
      const active = readPresets().find((configuration) => configuration.selected);
      if (active) {
        replaceRigConfigurations(
          readPresets().map((configuration) => (
            configuration.id === active.id
              ? {
                ...configuration,
                providerSettings: readCurrentProviderSettings(),
                updatedAt: Date.now(),
              }
              : configuration
          )),
          active.id,
        );
      }
    } else if (values.providerSettings && typeof values.providerSettings === "object") {
      const providerSettings = setCurrentProviderSettings(values.providerSettings, now);
      const active = readPresets().find((configuration) => configuration.selected);
      if (active) {
        replaceRigConfigurations(
          readPresets().map((configuration) => (
            configuration.id === active.id
              ? {
                ...configuration,
                providerSettings,
                updatedAt: Date.now(),
              }
              : configuration
          )),
          active.id,
        );
      }
    }
    if (values.toolPermissions && typeof values.toolPermissions === "object") {
      const active = readPresets().find((configuration) => configuration.selected);
      if (active) {
        replaceRigConfigurations(
          readPresets().map((configuration) => (
            configuration.id === active.id
              ? {
                ...configuration,
                toolPermissions: normalizeStoredToolPermissions(values.toolPermissions),
                updatedAt: Date.now(),
              }
              : configuration
          )),
          active.id,
        );
      }
    }
  }

  const legacyProvidersTable = database.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'providers_legacy_single'",
  ).get();
  if (legacyProvidersTable) {
    const legacyProviders = database.prepare(`
      SELECT p.provider AS id, p.provider AS name, p.provider AS type, p.base_url, p.api_key,
        ps.model, CASE WHEN ps.id = 1 THEN 1 ELSE 0 END AS selected
      FROM providers_legacy_single p
      LEFT JOIN provider_settings_legacy_single ps ON ps.provider = p.provider
    `).all().map((row) => ({ ...row, baseUrl: row.base_url, apiKey: row.api_key, selected: row.selected === 1 }));
    database.exec("BEGIN IMMEDIATE");
    try {
      writeValues({ providers: legacyProviders });
      database.exec("DROP TABLE provider_settings_legacy_single; DROP TABLE providers_legacy_single");
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }

  const legacySessionsTable = database.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'sessions_legacy_json'",
  ).get();
  if (legacySessionsTable) {
    const sessions = database.prepare(`
      SELECT id, title, workspace, messages, events, updated_at, sort_order
      FROM sessions_legacy_json ORDER BY sort_order
    `).all().map((row) => ({
      id: row.id,
      title: row.title,
      workspace: row.workspace,
      messages: JSON.parse(row.messages),
      events: JSON.parse(row.events),
      updatedAt: row.updated_at,
    }));
    database.exec("BEGIN IMMEDIATE");
    try {
      writeValues({ sessions });
      database.exec("DROP TABLE sessions_legacy_json");
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }

  const legacyTable = database.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'ui_state'",
  ).get();
  if (legacyTable) {
    const legacyState = Object.fromEntries(
      database.prepare("SELECT key, value FROM ui_state").all().flatMap(({ key, value }) => {
        try { return [[key, JSON.parse(value)]]; } catch { return []; }
      }),
    );
    const migratable = Object.fromEntries(
      Object.entries(legacyState).filter(([key]) => ALLOWED_KEYS.has(key)),
    );
    database.exec("BEGIN IMMEDIATE");
    try {
      if (Object.keys(migratable).length > 0) writeValues(migratable);
      database.exec("DROP TABLE ui_state");
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }

  if (readPresets().length === 0) {
    database.exec("BEGIN IMMEDIATE");
    try {
      replaceRigConfigurations([buildDefaultRigConfiguration()], null, { syncProviderSettings: false });
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }

  return {
    getAll() {
      const readMessages = database.prepare(`
        SELECT role, text, images FROM messages WHERE session_id = ? ORDER BY message_order
      `);
      const readEvents = database.prepare(`
        SELECT title, detail, input_prompt, server_response, timestamp
        FROM events WHERE session_id = ? ORDER BY event_order
      `);
      const readTokenUsage = database.prepare(`
        SELECT prompt_id, prompt_text, input_tokens, output_tokens, total_tokens, timestamp
        FROM token_usage WHERE session_id = ? ORDER BY prompt_order
      `);
      const sessions = database.prepare(`
        SELECT id, title, workspace, updated_at FROM sessions ORDER BY sort_order
      `).all().map((row) => ({
        id: row.id,
        title: row.title,
        workspace: row.workspace,
        messages: readMessages.all(row.id).map((message) => {
          const images = JSON.parse(message.images);
          return { role: message.role, text: message.text, ...(images.length > 0 ? { images } : {}) };
        }),
        events: readEvents.all(row.id).map((event) => {
          const detail = event.detail === null ? undefined : JSON.parse(event.detail);
          if (event.input_prompt !== null || event.server_response !== null) {
            const restored = detail && typeof detail === "object" ? detail : {};
            if (event.input_prompt !== null) restored.inputPrompt = JSON.parse(event.input_prompt);
            if (event.server_response !== null) restored.serverResponse = JSON.parse(event.server_response);
            return { title: event.title, detail: restored, timestamp: event.timestamp };
          }
          return { title: event.title, ...(detail === undefined ? {} : { detail }), timestamp: event.timestamp };
        }),
        tokenHistory: readTokenUsage.all(row.id).map((entry) => ({
          id: entry.prompt_id,
          prompt: entry.prompt_text,
          inputTokens: entry.input_tokens,
          outputTokens: entry.output_tokens,
          totalTokens: entry.total_tokens,
          timestamp: entry.timestamp,
        })),
        updatedAt: row.updated_at,
      }));
      const providers = readProviders();
      const provider = providers.find((item) => item.selected);
      const activePreset = readPresets().find((configuration) => configuration.selected);
      return {
        ...(sessions.length > 0 ? { sessions } : {}),
        ...(provider ? { providerSettings: {
          provider: provider.type,
          model: provider.model,
          baseUrl: provider.baseUrl,
          apiKey: provider.apiKey,
        } } : {}),
        ...(providers.length > 0 ? { providers } : {}),
        toolPermissions: normalizeStoredToolPermissions(activePreset?.toolPermissions),
      };
    },
    set(values) {
      database.exec("BEGIN IMMEDIATE");
      try {
        writeValues(values);
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
    close() {
      database.close();
    },
    getProviders() {
      return readProviders();
    },
    getSelectedProvider() {
      return readProviders().find((provider) => provider.selected) || null;
    },
    setSelectedProvider(providerId) {
      const id = String(providerId);
      const providers = readProviders();
      if (!providers.some((provider) => provider.id === id)) {
        throw new Error(`Unknown provider: ${id}`);
      }
      this.set({
        providers: providers.map((provider) => ({
          ...provider,
          selected: provider.id === id,
        })),
      });
      return this.getSelectedProvider();
    },
    getMcpConfig() {
      return database.prepare("SELECT content FROM mcp_configuration WHERE id = 1").get()?.content;
    },
    setMcpConfig(content) {
      const nextContent = String(content);
      upsertMcpConfiguration.run(nextContent, Date.now());
      const active = readPresets().find((configuration) => configuration.selected);
      if (!active) return;
      this.setRigConfigurations(
        readPresets().map((configuration) => (
          configuration.id === active.id ? { ...configuration, mcpConfig: nextContent, updatedAt: Date.now() } : configuration
        )),
        active.id,
      );
    },
    getSystemPrompts() {
      return Object.fromEntries(database.prepare(
        "SELECT key, content FROM system_prompts ORDER BY key",
      ).all().map(({ key, content }) => [key, content]));
    },
    getSystemPromptRows() {
      return database.prepare("SELECT key, title, content FROM system_prompts ORDER BY title").all();
    },
    setSystemPrompt(key, content) {
      const result = updateSystemPromptContent.run(String(content), Date.now(), String(key));
      if (result.changes === 0) throw new Error("Unknown system prompt.");
      const active = readPresets().find((configuration) => configuration.selected);
      if (!active) return;
      this.setRigConfigurations(
        readPresets().map((configuration) => (
          configuration.id === active.id
            ? {
              ...configuration,
              systemPrompts: { ...configuration.systemPrompts, [key]: String(content) },
              updatedAt: Date.now(),
            }
            : configuration
        )),
        active.id,
      );
    },
    getRigConfigurations() {
      const configurations = readPresets();
      return {
        configurations,
        activeConfigurationId: configurations.find((configuration) => configuration.selected)?.id || null,
      };
    },
    setRigConfigurations(configurations, activeConfigurationId) {
      database.exec("BEGIN IMMEDIATE");
      try {
        const result = replaceRigConfigurations(configurations, activeConfigurationId);
        database.exec("COMMIT");
        return result;
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
    getSkills() {
      return readSkills();
    },
    getSelectedSkills() {
      return readSkills().filter((skill) => skill.selected);
    },
    createSkill({ name, content }) {
      const normalizedName = String(name || "").trim();
      if (!normalizedName) throw new Error("Skill name is required.");
      if (readSkills().some((skill) => skill.name.toLocaleLowerCase() === normalizedName.toLocaleLowerCase())) {
        throw new Error(`A skill named ${normalizedName} already exists.`);
      }
      const id = crypto.randomUUID();
      insertSkill.run(id, normalizedName, String(content || ""), Date.now());
      const skills = readSkills();
      return { skill: skills.find((skill) => skill.id === id), skills };
    },
    updateSkill(skillId, { name, content }) {
      const id = String(skillId);
      const normalizedName = String(name || "").trim();
      const skills = readSkills();
      if (!skills.some((skill) => skill.id === id)) throw new Error(`Unknown skill: ${id}`);
      if (!normalizedName) throw new Error("Skill name is required.");
      if (skills.some((skill) => (
        skill.id !== id && skill.name.toLocaleLowerCase() === normalizedName.toLocaleLowerCase()
      ))) {
        throw new Error(`A skill named ${normalizedName} already exists.`);
      }
      updateSkill.run(normalizedName, String(content || ""), Date.now(), id);
      const updatedSkills = readSkills();
      return { skill: updatedSkills.find((skill) => skill.id === id), skills: updatedSkills };
    },
    setSelectedSkills(skillIds = []) {
      const ids = [...new Set((Array.isArray(skillIds) ? skillIds : []).map((id) => String(id)))];
      const skills = readSkills();
      const known = new Set(skills.map((skill) => skill.id));
      for (const id of ids) {
        if (!known.has(id)) throw new Error(`Unknown skill: ${id}`);
      }
      database.exec("BEGIN IMMEDIATE");
      try {
        clearSelectedSkills.run();
        ids.forEach((id) => selectSkill.run(id));
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
      const active = readPresets().find((configuration) => configuration.selected);
      if (active) {
        this.setRigConfigurations(
          readPresets().map((configuration) => (
            configuration.id === active.id
              ? { ...configuration, skillIds: ids, updatedAt: Date.now() }
              : configuration
          )),
          active.id,
        );
      }
      return this.getSelectedSkills();
    },
  };
}
