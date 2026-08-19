import HarnessSidebar from "./components/harness-sidebar.js";
import HarnessChat from "./components/harness-chat.js";
import WorkspacePanel from "./components/workspace-panel.js";
import StreamPanel from "./components/stream-panel.js";
import ColumnResizeHandle from "./components/column-resize-handle.js";
import { mountAppShell } from "./components/app-shell.js";
import { codeLanguageLabel, renderFilePreview } from "./lib/file-utils.js";
import { appendMarkdown, appendMessageText } from "./lib/message-rendering.js";
import {
  defaultProviderSettings,
  normalizeToolPermissions,
} from "./lib/settings.js";
import { normalizeRigComponentState } from "./lib/rig-presets.js";
import { CONFIG_TEMPLATES, mcpBlocks, quoteToml, replaceToolBlock, setToolBlockEnabled, updateToolBlock } from "./lib/mcp-config.js";
import { appendEvent, describeAgentEvent, renderEventList } from "./lib/event-rendering.js";
import { readFileAsDataUrl, renderImagePreviews as renderImagePreviewList } from "./lib/image-attachments.js";
import { normalizeSkillName, skillDraft, syncSkillContentName, validateSkillContent } from "./lib/skill-content.js";
import { clearSessionHistory, createSession, promptHistoryFromSessions, titleFromPrompt } from "./lib/sessions.js";
import { formatStepDuration, formatTokenCount, sessionActivityRuns } from "./lib/session-activity.js";
import { createStateSaveQueue } from "./lib/state-save-queue.js";
import { renderWorkspaceNodes, renderWorkspacePicker } from "./lib/workspace-rendering.js";
import { loadUiState, saveUiState } from "./services/ui-state-api.js";
import {
  createWorkspaceFolder,
  loadWorkspaceFile,
  loadWorkspaceTree as fetchWorkspaceTree,
  resolveWorkspaceMarkdownLink,
} from "./services/workspace-api.js";
import {
  createSkill as persistNewSkill,
  loadConfig as fetchConfig,
  loadHealth as fetchHealth,
  loadProviderModels as fetchProviderModels,
  loadRigConfigurations as fetchRigConfigurations,
  loadSkills as fetchSkills,
  loadSystemPrompts as fetchSystemPrompts,
  saveConfig as persistConfig,
  saveRigConfigurations as persistRigConfigurations,
  saveSelectedSkills as persistSelectedSkills,
  saveSkill as persistSkill,
  saveSystemPrompt as persistSystemPrompt,
} from "./services/settings-api.js";
import SocketService from "./services/socket-service.js";

const appShell = mountAppShell();
const sidebarComponent = document.querySelector("harness-sidebar");
const chatComponent = document.querySelector("harness-chat");
const workspaceComponent = document.querySelector("workspace-panel");
const streamComponent = document.querySelector("stream-panel");
const workspacePickerModal = document.querySelector("workspace-picker-modal");
const createWorkspaceModal = document.querySelector("create-workspace-modal");
const providersModal = document.querySelector("providers-modal");
const presetsModal = document.querySelector("presets-modal");
const systemPromptsModal = document.querySelector("system-prompts-modal");
const skillsModal = document.querySelector("skills-modal");
const toolsModal = document.querySelector("tools-modal");
const mcpModal = document.querySelector("mcp-modal");

const socketState = document.querySelector("#socketState");
const workspaceMeta = document.querySelector("#workspaceMeta");
const workspaceInput = document.querySelector("#workspaceInput");
const messages = document.querySelector("#messages");
const eventList = document.querySelector("#eventList");
const promptInput = document.querySelector("#promptInput");
const sendButton = document.querySelector("#sendButton");
const imagePreviewList = document.querySelector("#imagePreviewList");
const emptyState = document.querySelector("#emptyState");
const recentsList = document.querySelector("#recentsList");
const settingsDialog = document.querySelector("#settingsDialog");
const presetsDialog = document.querySelector("#presetsDialog");
const presetsList = document.querySelector("#presetsList");
const presetsCount = document.querySelector("#presetsCount");
const presetsStatus = document.querySelector("#presetsStatus");
const createPresetButton = document.querySelector("#createPresetButton");
const presetsListView = document.querySelector("#presetsListView");
const presetEditorForm = document.querySelector("#presetEditorForm");
const presetsDialogTitle = document.querySelector("#presetsDialogTitle");
const presetsDialogDescription = document.querySelector("#presetsDialogDescription");
const backToPresetsButton = document.querySelector("#backToPresetsButton");
const presetEditorName = document.querySelector("#presetEditorName");
const presetEditorProvider = document.querySelector("#presetEditorProvider");
const presetEditorModel = document.querySelector("#presetEditorModel");
const presetEditorBaseUrl = document.querySelector("#presetEditorBaseUrl");
const presetEditorApiKey = document.querySelector("#presetEditorApiKey");
const presetEditorInputSource = document.querySelector("#presetEditorInputSource");
const presetSystemPrompts = document.querySelector("#presetSystemPrompts");
const presetMcpServerList = document.querySelector("#presetMcpServerList");
const presetMcpType = document.querySelector("#presetMcpType");
const presetMcpLabel = document.querySelector("#presetMcpLabel");
const presetMcpUrlField = document.querySelector("#presetMcpUrlField");
const presetMcpUrl = document.querySelector("#presetMcpUrl");
const presetMcpCommand = document.querySelector("#presetMcpCommand");
const presetMcpArgs = document.querySelector("#presetMcpArgs");
const presetMcpCwd = document.querySelector("#presetMcpCwd");
const presetMcpStdioFields = [...document.querySelectorAll(".presetMcpStdioField")];
const presetMcpStatus = document.querySelector("#presetMcpStatus");
const savePresetEditButton = document.querySelector("#savePresetEditButton");
const systemPromptsDialog = document.querySelector("#systemPromptsDialog");
const skillsDialog = document.querySelector("#skillsDialog");
const systemPromptsList = document.querySelector("#systemPromptsList");
const systemPromptEditor = document.querySelector("#systemPromptEditor");
const systemPromptEditorTitle = document.querySelector("#systemPromptEditorTitle");
const systemPromptContent = document.querySelector("#systemPromptContent");
const systemPromptsStatus = document.querySelector("#systemPromptsStatus");
const saveSystemPromptButton = document.querySelector("#saveSystemPromptButton");
const skillsTableBody = document.querySelector("#skillsTableBody");
const skillsSearchInput = document.querySelector("#skillsSearchInput");
const skillsStatus = document.querySelector("#skillsStatus");
const skillLibrary = document.querySelector(".skillLibrary");
const skillEditor = document.querySelector("#skillEditor");
const skillEditorName = document.querySelector("#skillEditorName");
const skillEditorContent = document.querySelector("#skillEditorContent");
const skillsDialogTitle = document.querySelector("#skillsDialogTitle");
const skillsDialogDescription = document.querySelector("#skillsDialogDescription");
const backToSkillsButton = document.querySelector("#backToSkillsButton");
const toggleSkillColumnButton = document.querySelector("#toggleSkillColumnButton");
const cancelSkillEditButton = document.querySelector("#cancelSkillEditButton");
const saveSkillEditButton = document.querySelector("#saveSkillEditButton");
const saveSkillsButton = document.querySelector("#saveSkillsButton");
const configInput = document.querySelector("#configInput");
const configStatus = document.querySelector("#configStatus");
const saveConfigButton = document.querySelector("#saveConfigButton");
const settingsStatus = document.querySelector("#settingsStatus");
const reloadConfigButton = document.querySelector("#reloadConfigButton");
const toolsDialog = document.querySelector("#toolsDialog");
const mcpDialog = document.querySelector("#mcpDialog");
const toolPermissionsStatus = document.querySelector("#toolPermissionsStatus");
const toolTypeSelect = document.querySelector("#toolTypeSelect");
const toolLabelInput = document.querySelector("#toolLabelInput");
const toolUrlInput = document.querySelector("#toolUrlInput");
const toolCommandInput = document.querySelector("#toolCommandInput");
const toolArgsInput = document.querySelector("#toolArgsInput");
const toolCwdInput = document.querySelector("#toolCwdInput");
const addToolButton = document.querySelector("#addToolButton");
const mcpTableToolbar = document.querySelector("#mcpTableToolbar");
const mcpEditor = document.querySelector("#mcpEditor");
const mcpEditorTitle = document.querySelector("#mcpEditorTitle");
const reloadToolsButton = document.querySelector("#reloadToolsButton");
const toolsList = document.querySelector("#toolsList");
const toolsListPanel = document.querySelector(".toolsListPanel");
const toolsStatus = document.querySelector("#toolsStatus");
const providerSelect = document.querySelector("#providerSelect");
const providerSettingsSection = document.querySelector("#providerSettings");
const providerNameInput = document.querySelector("#providerNameInput");
const providersTableBody = document.querySelector("#providersTableBody");
const providerEditor = document.querySelector("#providerEditor");
const saveSettingsButton = document.querySelector("#saveSettingsButton");
const providerModelInput = document.querySelector("#providerModelInput");
const providerBaseUrlInput = document.querySelector("#providerBaseUrlInput");
const providerApiKeyInput = document.querySelector("#providerApiKeyInput");
const providerApiKeyField = document.querySelector("#providerApiKeyField");
const refreshModelsButton = document.querySelector("#refreshModelsButton");
const providerModelsStatus = document.querySelector("#providerModelsStatus");
const toolPermissionInputs = [...document.querySelectorAll("[data-tool-permission]")];
const sidebarToggleButton = document.querySelector("#sidebarToggleButton");
const sidebarResizeHandle = document.querySelector("#sidebarResizeHandle");
const streamResizeHandle = document.querySelector("#streamResizeHandle");
const toggleFilesColumnButton = document.querySelector("#toggleFilesColumnButton");
const toggleStreamColumnButton = document.querySelector("#toggleStreamColumnButton");
const filesResizeHandle = document.querySelector("#filesResizeHandle");
const workspaceTreeElement = document.querySelector("#workspaceTree");
const filesWorkspaceLabel = document.querySelector("#filesWorkspaceLabel");
const selectWorkspaceRootButton = document.querySelector("#selectWorkspaceRootButton");
const createWorkspaceButton = document.querySelector("#createWorkspaceButton");
const createWorkspaceDialog = document.querySelector("#createWorkspaceDialog");
const createWorkspaceParent = document.querySelector("#createWorkspaceParent");
const createWorkspaceName = document.querySelector("#createWorkspaceName");
const createWorkspaceStatus = document.querySelector("#createWorkspaceStatus");
const confirmCreateWorkspaceButton = document.querySelector("#confirmCreateWorkspaceButton");
const workspacePickerDialog = document.querySelector("#workspacePickerDialog");
const workspacePickerTree = document.querySelector("#workspacePickerTree");
const workspacePickerPath = document.querySelector("#workspacePickerPath");
const parentWorkspacePickerButton = document.querySelector("#parentWorkspacePickerButton");
const confirmWorkspacePickerButton = document.querySelector("#confirmWorkspacePickerButton");
const fileEditorDialog = document.querySelector("#fileEditorDialog");
const fileEditorTitle = document.querySelector("#fileEditorTitle");
const fileEditorPath = document.querySelector("#fileEditorPath");
const fileEditorLanguage = document.querySelector("#fileEditorLanguage");
const fileEditorPreviewCode = document.querySelector("#fileEditorPreviewCode");
const fileEditorStatus = document.querySelector("#fileEditorStatus");

let socketService;
let runActive = false;
let activeSessionId = null;
let pendingSessionId = null;
let promptHistoryIndex = null;
let promptHistoryDraft = "";
let streamingAnswer = null;
let attachedImages = [];
let defaultWorkspace = ".";
let workspaceBrowserRoot = null;
let workspaceBrowserNodes = [];
let pendingWorkspacePath = null;
let workspacePickerRoot = null;
let workspacePickerParent = null;
let pendingWorkspaceParent = null;
let previewingFilePath = null;
let editingMcpBlock = null;

function updateFileEditorPreview(filePath, content) {
  const language = renderFilePreview(fileEditorPreviewCode, content, { filePath });
  fileEditorLanguage.textContent = codeLanguageLabel(language || "plaintext");
}

const MIN_STREAM_WIDTH = 260;
const MIN_SIDEBAR_WIDTH = 220;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const SIDEBAR_WIDTH_STORAGE_KEY = "ai-harness.sidebarWidth";
const STREAM_WIDTH_STORAGE_KEY = "ai-harness.streamWidth";
const FILES_WIDTH_STORAGE_KEY = "ai-harness.filesWidth";
const FILES_VISIBLE_STORAGE_KEY = "ai-harness.filesVisible";
const STREAM_VISIBLE_STORAGE_KEY = "ai-harness.streamVisible";

let toolsConfigContent = "";
let systemPrompts = [];
let skills = [];
let editingSystemPromptKey = null;
let editingSkillId = null;

function renderSystemPrompts() {
  systemPromptsList.replaceChildren();
  for (const prompt of systemPrompts) {
    const row = document.createElement("article"); row.className = "systemPromptRow";
    const title = document.createElement("strong"); title.textContent = prompt.title;
    const edit = document.createElement("button"); edit.type = "button"; edit.textContent = "Edit";
    edit.addEventListener("click", () => {
      editingSystemPromptKey = prompt.key;
      systemPromptEditorTitle.textContent = prompt.title;
      systemPromptContent.value = prompt.content;
      systemPromptsList.hidden = true; systemPromptEditor.hidden = false; saveSystemPromptButton.hidden = false;
    });
    row.append(title, edit); systemPromptsList.append(row);
  }
}

async function loadSystemPrompts() {
  systemPrompts = await fetchSystemPrompts();
  renderSystemPrompts();
}

async function saveSystemPrompt() {
  await persistSystemPrompt(editingSystemPromptKey, systemPromptContent.value);
  systemPromptsStatus.textContent = "System prompt saved"; systemPromptsStatus.dataset.state = "success";
  systemPromptEditor.hidden = true; systemPromptsList.hidden = false; saveSystemPromptButton.hidden = true;
  await loadSystemPrompts();
}

function summarizeSkillContent(content = "") {
  const description = String(content).match(/^description\s*:\s*(.+)$/m)?.[1]?.trim();
  if (description) return description.replace(/^(["'])(.*)\1$/, "$2");
  return String(content).split(/\r?\n/).find((line) => {
    const value = line.trim();
    return value && value !== "---" && !value.startsWith("#") && !/^name\s*:/.test(value);
  }) || "SKILL.md";
}

function renderSkills() {
  skillsTableBody.replaceChildren();
  if (skills.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 3;
    cell.className = "skillEmptyState";
    cell.textContent = "No skills have been created yet.";
    row.append(cell);
    skillsTableBody.append(row);
    return;
  }

  const query = skillsSearchInput.value.trim().toLocaleLowerCase();
  const visibleSkills = query
    ? skills.filter((skill) => [skill.name, summarizeSkillContent(skill.content)]
      .some((value) => String(value || "").toLocaleLowerCase().includes(query)))
    : skills;
  if (visibleSkills.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 3;
    cell.className = "skillEmptyState";
    cell.textContent = `No skills match “${skillsSearchInput.value.trim()}”.`;
    row.append(cell);
    skillsTableBody.append(row);
    return;
  }

  for (const skill of visibleSkills) {
    const row = document.createElement("tr");
    const nameCell = document.createElement("th");
    nameCell.scope = "row";
    const name = document.createElement("div");
    name.className = "skillName";
    name.textContent = skill.name;
    const summary = document.createElement("div");
    summary.className = "skillSummary";
    summary.textContent = summarizeSkillContent(skill.content);
    nameCell.append(name, summary);

    const toggleCell = document.createElement("td");
    toggleCell.className = "skillToggleColumn";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = skill.selected === true;
    checkbox.dataset.skillId = skill.id;
    checkbox.setAttribute("aria-label", `Enable skill ${skill.name}`);
    checkbox.addEventListener("change", () => { skill.selected = checkbox.checked; });
    toggleCell.append(checkbox);

    const actionCell = document.createElement("td");
    actionCell.className = "skillActionColumn";
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "skillEditButton";
    editButton.textContent = "Edit";
    editButton.setAttribute("aria-label", `Edit ${skill.name}`);
    editButton.addEventListener("click", () => openSkillEditor(skill.id));
    actionCell.append(editButton);

    row.append(nameCell, toggleCell, actionCell);
    skillsTableBody.append(row);
  }
}

async function loadSkills() {
  skills = await fetchSkills();
  renderSkills();
}

function setSkillEditorPending(pending) {
  const inactive = skillEditor.hidden;
  skillEditorName.disabled = inactive || pending;
  skillEditorContent.disabled = inactive || pending;
  saveSkillEditButton.disabled = pending;
  cancelSkillEditButton.disabled = pending;
  backToSkillsButton.disabled = pending;
  saveSkillEditButton.textContent = pending
    ? "Saving…"
    : editingSkillId === null ? "Create skill" : "Save skill";
}

function openSkillEditor(skillId = null) {
  const skill = skillId ? skills.find((entry) => entry.id === skillId) : null;
  if (skillId && !skill) return;
  editingSkillId = skill?.id || null;
  skillEditorName.value = skill?.name || "";
  skillEditorContent.value = skill?.content || skillDraft();
  skillLibrary.hidden = true;
  skillEditor.hidden = false;
  backToSkillsButton.hidden = false;
  toggleSkillColumnButton.hidden = true;
  cancelSkillEditButton.hidden = false;
  saveSkillEditButton.hidden = false;
  saveSkillsButton.hidden = true;
  skillsDialogTitle.textContent = skill ? `Edit ${skill.name}` : "Add skill";
  skillsDialogDescription.textContent = skill
    ? "Update this skill's metadata and instructions"
    : "Create a skill with valid metadata and instructions";
  skillsStatus.textContent = skill
    ? `Editing ${skill.name}`
    : "New skills are stored in SQLite.";
  skillsStatus.dataset.state = "";
  setSkillEditorPending(false);
  if (skill) skillEditorContent.focus();
  else skillEditorName.focus();
}

function closeSkillEditor({ preserveStatus = false } = {}) {
  editingSkillId = null;
  skillLibrary.hidden = false;
  skillEditor.hidden = true;
  backToSkillsButton.hidden = true;
  toggleSkillColumnButton.hidden = false;
  cancelSkillEditButton.hidden = true;
  saveSkillEditButton.hidden = true;
  saveSkillsButton.hidden = false;
  skillsDialogTitle.textContent = "Skills";
  skillsDialogDescription.textContent = "Choose which SKILL.md guides are injected into new agent sessions";
  setSkillEditorPending(false);
  if (skillsDialog.open && !preserveStatus) {
    skillsStatus.textContent = "Skill selections are stored in SQLite.";
    skillsStatus.dataset.state = "";
  }
}

async function saveSkillEdit() {
  const name = normalizeSkillName(skillEditorName.value);
  if (!name) {
    skillsStatus.textContent = "Enter a skill name using lowercase letters, numbers, and hyphens.";
    skillsStatus.dataset.state = "error";
    skillEditorName.focus();
    return;
  }
  let content;
  try {
    content = validateSkillContent(syncSkillContentName(skillEditorContent.value, name));
  } catch (error) {
    skillsStatus.textContent = error.message;
    skillsStatus.dataset.state = "error";
    skillEditorContent.focus();
    return;
  }
  setSkillEditorPending(true);
  try {
    const result = editingSkillId
      ? await persistSkill(editingSkillId, name, content)
      : await persistNewSkill(name, content);
    skills = Array.isArray(result.skills) ? result.skills : await fetchSkills();
    renderSkills();
    send({ type: "reload_skills" });
    skillsStatus.textContent = editingSkillId ? `${name} updated.` : `${name} created.`;
    skillsStatus.dataset.state = "success";
    closeSkillEditor({ preserveStatus: true });
  } catch (error) {
    skillsStatus.textContent = error.message;
    skillsStatus.dataset.state = "error";
    setSkillEditorPending(false);
  }
}

function currentSelectedSkillIds() {
  return skills.filter((skill) => skill.selected === true).map((skill) => skill.id);
}

async function saveSkills() {
  const selectedSkillIds = currentSelectedSkillIds();
  const response = await persistSelectedSkills(selectedSkillIds);
  const selectedIds = new Set((response.skills || []).map((skill) => skill.id));
  skills = skills.map((skill) => ({ ...skill, selected: selectedIds.has(skill.id) }));
  renderSkills();
  send({ type: "reload_skills" });
  skillsStatus.textContent = `${selectedSkillIds.length} skill${selectedSkillIds.length === 1 ? "" : "s"} selected`;
  skillsStatus.dataset.state = "success";
}

let sessions = [];
let providerSettings = defaultProviderSettings();
let providers = [];
let editingProviderId = null;
let storedToolPermissions = normalizeToolPermissions();
let presetConfigurations = [];
let activePresetId = null;
let editingPresetId = null;
let editingPresetMcpConfig = "";
let presetMutationPending = false;
let sidebarWidth = 344;
let streamWidth = 360;
let filesWidth = 300;
const persistUiState = createStateSaveQueue(
  saveUiState,
  (error) => addEvent("UI state save failed", error.message, { persist: false }),
);

function setPresetsStatus(message, state = "") {
  presetsStatus.textContent = message;
  presetsStatus.dataset.state = state;
}

function presetMeta(configuration) {
  const settings = configuration.providerSettings || {};
  const provider = settings.provider || "openai";
  const model = settings.model || "default model";
  const toolCount = Object.values(configuration.toolPermissions || {}).filter(Boolean).length;
  return `${provider} · ${model} · ${toolCount} tools enabled`;
}

const PRESET_EFFECT_INPUTS = {
  composer: "presetEffectComposer",
  tools: "presetEffectTools",
  mcp: "presetEffectMcp",
  validation: "presetEffectValidation",
};

const PRESET_TOOL_INPUTS = {
  list_files: "presetToolListFiles",
  read_file: "presetToolReadFile",
  write_file: "presetToolWriteFile",
  search_files: "presetToolSearchFiles",
  curl: "presetToolCurl",
  run_command: "presetToolRunCommand",
};

const PRESET_PROMPT_TITLES = {
  prompt_refinement: "Input composer refinement",
  agent_instructions: "Agent instructions",
  workspace_context: "Workspace context",
  tool_contract: "Tool contract",
  validation_reminder: "Validation reminder",
};

function setPresetEditorPending(pending) {
  for (const control of presetEditorForm.querySelectorAll("input, select, textarea, button")) {
    control.disabled = pending;
  }
  backToPresetsButton.disabled = pending;
  savePresetEditButton.textContent = pending ? "Saving..." : "Save preset";
}

function renderPresetPromptEditors(prompts = {}) {
  presetSystemPrompts.replaceChildren();
  for (const [key, content] of Object.entries(prompts)) {
    const label = document.createElement("label");
    label.className = "presetPromptField";
    const title = document.createElement("span");
    title.textContent = PRESET_PROMPT_TITLES[key] || key.replaceAll("_", " ");
    const textarea = document.createElement("textarea");
    textarea.dataset.promptKey = key;
    textarea.spellcheck = false;
    textarea.value = content;
    label.append(title, textarea);
    presetSystemPrompts.append(label);
  }
}

function setPresetMcpStatus(message, state = "") {
  presetMcpStatus.textContent = message;
  presetMcpStatus.dataset.state = state;
}

function renderPresetMcpTypeFields() {
  const remote = presetMcpType.value === "remote";
  presetMcpUrlField.hidden = !remote;
  for (const field of presetMcpStdioFields) field.hidden = remote;
}

function renderPresetMcpServers() {
  presetMcpServerList.replaceChildren();
  const blocks = mcpBlocks(editingPresetMcpConfig);
  if (blocks.length === 0) {
    const empty = document.createElement("p");
    empty.className = "presetMcpEmpty";
    empty.textContent = "No MCP servers configured for this preset.";
    presetMcpServerList.append(empty);
    return;
  }
  for (const block of blocks) {
    const row = document.createElement("article");
    row.className = "presetMcpServerRow";
    const identity = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = block.label;
    const detail = document.createElement("small");
    detail.textContent = `${block.type} · ${block.detail}`;
    identity.append(name, detail);
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = `presetMcpServerToggle${block.enabled ? " enabled" : ""}`;
    toggle.textContent = block.enabled ? "On" : "Off";
    toggle.setAttribute("aria-pressed", String(block.enabled));
    toggle.setAttribute("aria-label", `${block.enabled ? "Disable" : "Enable"} ${block.label}`);
    toggle.addEventListener("click", () => {
      if (presetMutationPending || runActive) return;
      editingPresetMcpConfig = setToolBlockEnabled(editingPresetMcpConfig, block, !block.enabled);
      renderPresetMcpServers();
      setPresetMcpStatus(`${block.label} ${block.enabled ? "disabled" : "enabled"}. Save the preset to write this change to SQLite.`, "success");
    });
    row.append(identity, toggle);
    presetMcpServerList.append(row);
  }
}

function addPresetMcpServer() {
  if (presetMutationPending || runActive) return;
  const label = presetMcpLabel.value.trim();
  if (!/^[A-Za-z0-9_-]+$/.test(label)) {
    setPresetMcpStatus("Label may contain only letters, numbers, _ or -.", "error");
    presetMcpLabel.focus();
    return;
  }
  let snippet;
  if (presetMcpType.value === "remote") {
    const url = presetMcpUrl.value.trim();
    if (!url) {
      setPresetMcpStatus("Server URL is required.", "error");
      presetMcpUrl.focus();
      return;
    }
    snippet = `[[mcp.servers]]\nserver_label = "${quoteToml(label)}"\nserver_url = "${quoteToml(url)}"\nrequire_approval = "never"`;
  } else {
    const command = presetMcpCommand.value.trim();
    if (!command) {
      setPresetMcpStatus("Command is required.", "error");
      presetMcpCommand.focus();
      return;
    }
    const args = presetMcpArgs.value.split(/\s+/).filter(Boolean).map((arg) => `"${quoteToml(arg)}"`).join(", ");
    const cwd = presetMcpCwd.value.trim();
    snippet = `[mcp_servers.${label}]\ncommand = "${quoteToml(command)}"\nargs = [${args}]${cwd ? `\ncwd = "${quoteToml(cwd)}"` : ""}\nmessage_format = "content-length"\nrequire_approval = "never"`;
  }
  const prefix = editingPresetMcpConfig.trimEnd();
  editingPresetMcpConfig = `${prefix}${prefix ? "\n\n" : ""}${snippet}\n`;
  presetMcpLabel.value = "";
  presetMcpUrl.value = "";
  presetMcpCommand.value = "";
  presetMcpArgs.value = "";
  presetMcpCwd.value = "";
  renderPresetMcpServers();
  setPresetMcpStatus(`${label} added. Save the preset to write this change to SQLite.`, "success");
}

function openPresetEditor(configurationId) {
  const configuration = presetConfigurations.find((preset) => preset.id === configurationId);
  if (!configuration || presetMutationPending || runActive) return;
  const provider = { ...defaultProviderSettings(), ...(configuration.providerSettings || {}) };
  const component = normalizeRigComponentState(configuration.componentState);
  const permissions = normalizeToolPermissions(configuration.toolPermissions);
  editingPresetId = configuration.id;
  presetEditorName.value = configuration.name;
  presetEditorProvider.value = provider.provider;
  presetEditorModel.value = provider.model;
  presetEditorBaseUrl.value = provider.baseUrl;
  presetEditorApiKey.value = provider.apiKey;
  presetEditorInputSource.value = component.inputSource;
  for (const [key, id] of Object.entries(PRESET_EFFECT_INPUTS)) {
    document.querySelector(`#${id}`).checked = component.effects[key] !== false;
  }
  for (const [key, id] of Object.entries(PRESET_TOOL_INPUTS)) {
    document.querySelector(`#${id}`).checked = permissions[key] === true;
  }
  renderPresetPromptEditors(configuration.systemPrompts || {});
  editingPresetMcpConfig = configuration.mcpConfig || "";
  presetMcpType.value = "remote";
  renderPresetMcpTypeFields();
  renderPresetMcpServers();
  setPresetMcpStatus("Loaded from this preset's SQLite record.");
  presetsListView.hidden = true;
  presetEditorForm.hidden = false;
  backToPresetsButton.hidden = false;
  presetsDialog.classList.add("editor-open");
  presetsDialogTitle.textContent = `Edit ${configuration.name}`;
  presetsDialogDescription.textContent = "Configure the complete shared preset snapshot";
  setPresetsStatus(configuration.id === activePresetId ? "Changes to this active preset apply immediately when saved." : "Editing an inactive preset will not change the current runtime.");
  setPresetEditorPending(false);
  presetEditorName.focus();
  presetEditorName.select();
}

function closePresetEditor({ preserveStatus = false } = {}) {
  editingPresetId = null;
  editingPresetMcpConfig = "";
  presetsListView.hidden = false;
  presetEditorForm.hidden = true;
  backToPresetsButton.hidden = true;
  presetsDialog.classList.remove("editor-open");
  presetsDialogTitle.textContent = "Presets";
  presetsDialogDescription.textContent = "Manage shared provider, prompt, tool, MCP, and workflow configurations";
  if (presetsDialog.open && !preserveStatus) setPresetsStatus("Presets are shared with the workflow interface.");
}

async function savePresetEdit() {
  const index = presetConfigurations.findIndex((configuration) => configuration.id === editingPresetId);
  if (index < 0 || presetMutationPending || runActive) return;
  const current = presetConfigurations[index];
  const systemPrompts = Object.fromEntries(
    [...presetSystemPrompts.querySelectorAll("textarea[data-prompt-key]")]
      .map((textarea) => [textarea.dataset.promptKey, textarea.value]),
  );
  const componentState = normalizeRigComponentState({
    ...current.componentState,
    inputSource: presetEditorInputSource.value,
    effects: Object.fromEntries(Object.entries(PRESET_EFFECT_INPUTS).map(([key, id]) => [key, document.querySelector(`#${id}`).checked])),
  });
  const toolPermissions = normalizeToolPermissions(
    Object.fromEntries(Object.entries(PRESET_TOOL_INPUTS).map(([key, id]) => [key, document.querySelector(`#${id}`).checked])),
  );
  const updated = {
    ...current,
    name: presetEditorName.value.trim() || `Preset ${index + 1}`,
    providerSettings: {
      provider: presetEditorProvider.value,
      model: presetEditorModel.value.trim(),
      baseUrl: presetEditorBaseUrl.value.trim(),
      apiKey: presetEditorApiKey.value,
    },
    componentState,
    toolPermissions,
    systemPrompts,
    mcpConfig: editingPresetMcpConfig,
    updatedAt: Date.now(),
  };
  const configurations = presetConfigurations.map((configuration, configurationIndex) => configurationIndex === index ? updated : configuration);
  setPresetEditorPending(true);
  const saved = await savePresetConfigurations(configurations, activePresetId, {
    syncRuntime: current.id === activePresetId,
    successMessage: `${updated.name} updated.`,
  });
  setPresetEditorPending(false);
  if (saved) {
    addEvent("Preset updated", updated.name);
    closePresetEditor({ preserveStatus: true });
  }
}

function renderPresets() {
  presetsList.replaceChildren();
  presetsCount.textContent = `${presetConfigurations.length} preset${presetConfigurations.length === 1 ? "" : "s"}`;
  createPresetButton.disabled = presetMutationPending || runActive || presetConfigurations.length === 0;

  if (presetConfigurations.length === 0) {
    const empty = document.createElement("p");
    empty.className = "presetEmpty";
    empty.textContent = "No presets are available.";
    presetsList.append(empty);
    return;
  }

  for (const configuration of presetConfigurations) {
    const isActive = configuration.id === activePresetId;
    const row = document.createElement("article");
    row.className = `presetRow${isActive ? " active" : ""}`;

    const identity = document.createElement("div");
    identity.className = "presetIdentity";
    const name = document.createElement("strong");
    name.className = "presetName";
    name.textContent = configuration.name;
    const meta = document.createElement("span");
    meta.className = "presetMeta";
    meta.textContent = presetMeta(configuration);
    identity.append(name, meta);

    const actions = document.createElement("div");
    actions.className = "presetActions";
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.textContent = "Edit";
    editButton.disabled = presetMutationPending || runActive;
    editButton.addEventListener("click", () => openPresetEditor(configuration.id));

    if (isActive) {
      const badge = document.createElement("span");
      badge.className = "presetActiveBadge";
      badge.textContent = "Active";
      actions.append(badge);
    } else {
      const useButton = document.createElement("button");
      useButton.type = "button";
      useButton.textContent = "Use";
      useButton.disabled = presetMutationPending || runActive;
      useButton.addEventListener("click", () => activatePreset(configuration.id));
      actions.append(useButton);
    }

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "presetDeleteButton";
    deleteButton.textContent = "Delete";
    deleteButton.disabled = presetMutationPending || runActive || presetConfigurations.length <= 1;
    deleteButton.addEventListener("click", () => deletePreset(configuration.id));
    actions.prepend(editButton);
    actions.append(deleteButton);
    row.append(identity, actions);
    presetsList.append(row);
  }
}

async function syncPresetRuntimeState() {
  const [state, config] = await Promise.all([loadUiState(), fetchConfig()]);
  providerSettings = { ...defaultProviderSettings(), ...(state.providerSettings || {}) };
  providers = Array.isArray(state.providers) ? state.providers : [];
  editingProviderId = providers.find((provider) => provider.selected)?.id || null;
  storedToolPermissions = normalizeToolPermissions(state.toolPermissions);
  toolsConfigContent = config.content || "";
  systemPrompts = [];
  renderProviderSettings(providerSettings);
  renderProvidersTable();
  renderToolPermissions();
  renderTools();
  workspaceMeta.textContent = `${providerSettings.provider} · ${providerSettings.model || "default model"}`;
  send({ type: "provider_settings", ...providerSettings });
  send({ type: "tool_permissions", permissions: storedToolPermissions });
  send({ type: "reload_tools" });
}

async function savePresetConfigurations(configurations, nextActivePresetId, { syncRuntime = false, successMessage } = {}) {
  if (presetMutationPending || runActive) {
    if (runActive) setPresetsStatus("Stop the active run before changing presets.", "error");
    return false;
  }
  presetMutationPending = true;
  renderPresets();
  setPresetsStatus("Saving presets...");
  try {
    const payload = configurations.map((configuration) => ({
      ...configuration,
      selected: configuration.id === nextActivePresetId,
    }));
    const result = await persistRigConfigurations(payload, nextActivePresetId);
    presetConfigurations = Array.isArray(result.configurations) ? result.configurations : payload;
    activePresetId = result.activeConfigurationId || nextActivePresetId;
    if (syncRuntime) await syncPresetRuntimeState();
    setPresetsStatus(successMessage || "Presets saved.", "success");
    return true;
  } catch (error) {
    setPresetsStatus(error.message, "error");
    return false;
  } finally {
    presetMutationPending = false;
    renderPresets();
  }
}

async function loadPresets() {
  closePresetEditor();
  createPresetButton.disabled = true;
  setPresetsStatus("Loading presets...");
  try {
    const result = await fetchRigConfigurations();
    presetConfigurations = Array.isArray(result.configurations) ? result.configurations : [];
    activePresetId = result.activeConfigurationId || presetConfigurations.find((configuration) => configuration.selected)?.id || null;
    setPresetsStatus("Presets are shared with the workflow interface.");
  } catch (error) {
    presetConfigurations = [];
    activePresetId = null;
    setPresetsStatus(error.message, "error");
  }
  renderPresets();
}

async function activatePreset(configurationId) {
  const configuration = presetConfigurations.find((preset) => preset.id === configurationId);
  if (!configuration || configurationId === activePresetId) return;
  const saved = await savePresetConfigurations(presetConfigurations, configurationId, {
    syncRuntime: true,
    successMessage: `${configuration.name} activated.`,
  });
  if (saved) addEvent("Preset selected", configuration.name);
}

async function duplicateActivePreset() {
  const active = presetConfigurations.find((configuration) => configuration.id === activePresetId) || presetConfigurations[0];
  if (!active) return;
  const duplicate = {
    ...structuredClone(active),
    id: crypto.randomUUID(),
    name: `Copy of ${active.name}`,
    updatedAt: Date.now(),
    selected: true,
  };
  const saved = await savePresetConfigurations(
    [duplicate, ...presetConfigurations.map((configuration) => ({ ...configuration, selected: false }))],
    duplicate.id,
    { syncRuntime: true, successMessage: `${duplicate.name} created and activated.` },
  );
  if (saved) addEvent("Preset created", duplicate.name);
}

async function deletePreset(configurationId) {
  const index = presetConfigurations.findIndex((configuration) => configuration.id === configurationId);
  if (index < 0 || presetConfigurations.length <= 1) return;
  const deleted = presetConfigurations[index];
  if (!window.confirm(`Delete preset “${deleted.name}”?`)) return;
  const configurations = presetConfigurations.filter((configuration) => configuration.id !== configurationId);
  const deletingActive = configurationId === activePresetId;
  const nextActivePresetId = deletingActive
    ? configurations[Math.min(index, configurations.length - 1)]?.id || configurations[0]?.id
    : activePresetId;
  const saved = await savePresetConfigurations(configurations, nextActivePresetId, {
    syncRuntime: deletingActive,
    successMessage: `${deleted.name} deleted.`,
  });
  if (saved) addEvent("Preset deleted", deleted.name);
}

function applySidebarState(collapsed) {
  appShell.classList.toggle("sidebar-collapsed", collapsed);
  sidebarToggleButton.setAttribute("aria-pressed", String(collapsed));
  sidebarToggleButton.setAttribute(
    "aria-label",
    collapsed ? "Expand sidebar" : "Collapse sidebar",
  );
  sidebarToggleButton.title = collapsed ? "Expand sidebar" : "Collapse sidebar";
}

function toggleSidebar() {
  const collapsed = !appShell.classList.contains("sidebar-collapsed");
  persistUiState({ sidebarCollapsed: collapsed });
  applySidebarState(collapsed);
}

function applyRightColumnState(column, visible) {
  const isFiles = column === "files";
  const className = isFiles ? "files-collapsed" : "stream-collapsed";
  const button = isFiles ? toggleFilesColumnButton : toggleStreamColumnButton;
  const label = isFiles ? "workspace" : "stream";
  appShell.classList.toggle(className, !visible);
  button.setAttribute("aria-pressed", String(visible));
  button.title = `${visible ? "Hide" : "Show"} ${label} column`;
  button.setAttribute("aria-label", button.title);
}

function toggleRightColumn(column) {
  const isFiles = column === "files";
  const visible = appShell.classList.contains(isFiles ? "files-collapsed" : "stream-collapsed");
  localStorage.setItem(isFiles ? FILES_VISIBLE_STORAGE_KEY : STREAM_VISIBLE_STORAGE_KEY, String(visible));
  applyRightColumnState(column, visible);
}

function setSidebarWidth(width) {
  const clamped = Math.max(width, MIN_SIDEBAR_WIDTH);
  appShell.style.setProperty("--sidebar-width", `${clamped}px`);
  sidebarResizeHandle.setAttribute("aria-valuemin", String(MIN_SIDEBAR_WIDTH));
  sidebarResizeHandle.setAttribute("aria-valuenow", String(clamped));
  sidebarWidth = clamped;
  localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(clamped));
}

function startSidebarResize(event) {
  if (event.button !== 0) return;
  event.preventDefault();
  appShell.classList.remove("sidebar-collapsed");
  applySidebarState(false);
  persistUiState({ sidebarCollapsed: false });
  appShell.classList.add("resizing-column");
  sidebarResizeHandle.classList.add("is-resizing");
  sidebarResizeHandle.setPointerCapture(event.pointerId);
  const move = (moveEvent) => setSidebarWidth(moveEvent.clientX);
  const stop = () => {
    appShell.classList.remove("resizing-column");
    sidebarResizeHandle.classList.remove("is-resizing");
    sidebarResizeHandle.removeEventListener("pointermove", move);
    sidebarResizeHandle.removeEventListener("pointerup", stop);
    sidebarResizeHandle.removeEventListener("pointercancel", stop);
  };
  sidebarResizeHandle.addEventListener("pointermove", move);
  sidebarResizeHandle.addEventListener("pointerup", stop);
  sidebarResizeHandle.addEventListener("pointercancel", stop);
}

function clampStreamWidth(width) {
  return Math.max(width, MIN_STREAM_WIDTH);
}

function setStreamWidth(width) {
  const clamped = clampStreamWidth(width);
  appShell.style.setProperty("--stream-width", `${clamped}px`);
  streamResizeHandle.setAttribute("aria-valuemin", String(MIN_STREAM_WIDTH));
  streamResizeHandle.setAttribute("aria-valuenow", String(clamped));
  streamWidth = clamped;
  localStorage.setItem(STREAM_WIDTH_STORAGE_KEY, String(clamped));
}

function startStreamResize(event) {
  if (event.button !== 0) return;
  event.preventDefault();
  appShell.classList.add("resizing-column");
  streamResizeHandle.classList.add("is-resizing");
  streamResizeHandle.setPointerCapture(event.pointerId);

  const move = (moveEvent) => {
    setStreamWidth(window.innerWidth - moveEvent.clientX - 4);
  };
  const stop = () => {
    appShell.classList.remove("resizing-column");
    streamResizeHandle.classList.remove("is-resizing");
    streamResizeHandle.removeEventListener("pointermove", move);
    streamResizeHandle.removeEventListener("pointerup", stop);
    streamResizeHandle.removeEventListener("pointercancel", stop);
  };

  streamResizeHandle.addEventListener("pointermove", move);
  streamResizeHandle.addEventListener("pointerup", stop);
  streamResizeHandle.addEventListener("pointercancel", stop);
}

function setFilesWidth(width) {
  const clamped = Math.max(width, 220);
  appShell.style.setProperty("--files-width", `${clamped}px`);
  filesResizeHandle.setAttribute("aria-valuemin", "220");
  filesResizeHandle.setAttribute("aria-valuenow", String(clamped));
  filesWidth = clamped;
  localStorage.setItem(FILES_WIDTH_STORAGE_KEY, String(clamped));
}

function startFilesResize(event) {
  if (event.button !== 0) return;
  event.preventDefault();
  appShell.classList.add("resizing-column");
  filesResizeHandle.classList.add("is-resizing");
  filesResizeHandle.setPointerCapture(event.pointerId);
  const move = (moveEvent) => {
    const visibleStreamWidth = appShell.classList.contains("stream-collapsed") ? 0 : streamWidth + 8;
    setFilesWidth(window.innerWidth - moveEvent.clientX - visibleStreamWidth - 4);
  };
  const stop = () => {
    appShell.classList.remove("resizing-column"); filesResizeHandle.classList.remove("is-resizing");
    filesResizeHandle.removeEventListener("pointermove", move);
    filesResizeHandle.removeEventListener("pointerup", stop);
    filesResizeHandle.removeEventListener("pointercancel", stop);
  };
  filesResizeHandle.addEventListener("pointermove", move);
  filesResizeHandle.addEventListener("pointerup", stop);
  filesResizeHandle.addEventListener("pointercancel", stop);
}

async function openFilePreview(node) {
  const workspace = activeSession()?.workspace || defaultWorkspace;
  previewingFilePath = node.path;
  fileEditorTitle.textContent = node.name;
  fileEditorPath.textContent = node.path;
  updateFileEditorPreview(node.path, "");
  fileEditorStatus.textContent = "Loading…";
  fileEditorDialog.showModal();
  try {
    const content = await loadWorkspaceFile(workspace, node.path);
    if (previewingFilePath !== node.path || !fileEditorDialog.open) return;
    updateFileEditorPreview(node.path, content);
    fileEditorStatus.textContent = "";
  } catch (error) {
    fileEditorStatus.textContent = error.message;
  }
}

async function loadWorkspaceTree() {
  const selectedWorkspace = activeSession()?.workspace || defaultWorkspace;
  filesWorkspaceLabel.textContent = selectedWorkspace;
  workspaceTreeElement.innerHTML = '<p class="workspaceTreeStatus">Loading files…</p>';
  selectWorkspaceRootButton.disabled = true;
  try {
    const payload = await fetchWorkspaceTree(selectedWorkspace);
    workspaceBrowserRoot = payload.root;
    workspaceBrowserNodes = payload.tree || [];
    selectWorkspaceRootButton.disabled = false;
    selectWorkspaceRootButton.title = "Choose workspace folder";
    workspaceTreeElement.replaceChildren();
    renderWorkspaceNodes(workspaceBrowserNodes, workspaceTreeElement, {
      onOpenFile: openFilePreview,
      onSelectFolder(path) { workspaceInput.value = path; saveActiveWorkspace(); },
    });
  } catch (error) {
    workspaceBrowserRoot = null;
    workspaceBrowserNodes = [];
    workspaceTreeElement.innerHTML = "";
    const status = document.createElement("p"); status.className = "workspaceTreeStatus"; status.textContent = error.message;
    workspaceTreeElement.append(status);
  }
}

function chooseWorkspacePickerPath(path) {
  pendingWorkspacePath = path;
  workspacePickerPath.textContent = path;
  workspacePickerTree.querySelectorAll(".workspacePickerOption").forEach((button) => {
    button.classList.toggle("selected", button.dataset.path === path);
  });
}

async function loadWorkspacePickerRoot(rootPath) {
  parentWorkspacePickerButton.disabled = true;
  createWorkspaceButton.disabled = true;
  workspacePickerTree.innerHTML = '<p class="workspaceTreeStatus">Loading folders…</p>';
  const payload = await fetchWorkspaceTree(rootPath);
  workspacePickerRoot = payload.root;
  workspacePickerParent = payload.parent;
  parentWorkspacePickerButton.disabled = workspacePickerParent === workspacePickerRoot;
  createWorkspaceButton.disabled = false;
  renderWorkspacePicker(workspacePickerTree, workspacePickerRoot, payload.tree || [], {
    onChoose: chooseWorkspacePickerPath,
    onConfirm: () => confirmWorkspacePickerButton.click(),
  });
  chooseWorkspacePickerPath(workspacePickerRoot);
}

async function openWorkspacePicker() {
  if (!workspaceBrowserRoot) return;
  workspacePickerDialog.showModal();
  try { await loadWorkspacePickerRoot(workspaceBrowserRoot); } catch (error) { workspacePickerPath.textContent = error.message; }
}

function openCreateWorkspaceDialog() {
  if (!workspacePickerRoot) return;
  pendingWorkspaceParent = pendingWorkspacePath || workspacePickerRoot;
  createWorkspaceParent.textContent = `Inside ${pendingWorkspaceParent}`;
  createWorkspaceName.value = "";
  createWorkspaceStatus.textContent = "";
  confirmCreateWorkspaceButton.disabled = false;
  createWorkspaceDialog.showModal();
  createWorkspaceName.focus();
}

async function createAndSelectWorkspace() {
  const parent = pendingWorkspaceParent;
  if (!parent) return;
  const name = createWorkspaceName.value.trim();
  if (!name) {
    createWorkspaceStatus.textContent = "Enter a folder name.";
    createWorkspaceName.focus();
    return;
  }
  confirmCreateWorkspaceButton.disabled = true;
  createWorkspaceName.disabled = true;
  createWorkspaceStatus.textContent = "Creating folder…";
  try {
    const result = await createWorkspaceFolder(parent, name);
    workspaceInput.value = result.path;
    createWorkspaceDialog.close();
    if (workspacePickerDialog.open) workspacePickerDialog.close();
    saveActiveWorkspace();
    addEvent("Workspace created", result.path);
  } catch (error) {
    createWorkspaceStatus.textContent = error.message;
  } finally {
    confirmCreateWorkspaceButton.disabled = false;
    createWorkspaceName.disabled = false;
    if (createWorkspaceDialog.open) createWorkspaceName.focus();
  }
}

function saveSessions() {
  return persistUiState({ sessions });
}

function activeSession() {
  return sessions.find((session) => session.id === activeSessionId);
}

function renderWorkspace() {
  workspaceInput.value = activeSession()?.workspace || defaultWorkspace;
}

function saveActiveWorkspace() {
  const session = activeSession();
  if (!session) return;
  const workspace = workspaceInput.value.trim();
  if (!workspace) {
    workspaceInput.value = session.workspace || defaultWorkspace;
    return;
  }
  if (workspace === session.workspace) return;
  session.workspace = workspace;
  filesWorkspaceLabel.textContent = workspace;
  session.updatedAt = Date.now();
  saveSessions();
  send({ type: "reset", sessionId: session.id });
  addEvent("Workspace selected", workspace);
  loadWorkspaceTree();
}

function promptHistory() {
  return promptHistoryFromSessions(sessions);
}

function resetPromptHistoryCursor() {
  promptHistoryIndex = null;
  promptHistoryDraft = "";
}

function setPromptInput(value) {
  promptInput.value = value;
  resizePromptInput();
  promptInput.setSelectionRange(promptInput.value.length, promptInput.value.length);
}

function navigatePromptHistory(direction) {
  const history = promptHistory();
  if (history.length === 0) return false;

  if (promptHistoryIndex === null) {
    promptHistoryDraft = promptInput.value;
    promptHistoryIndex = history.length;
  }

  promptHistoryIndex += direction;
  if (promptHistoryIndex < 0) promptHistoryIndex = 0;
  if (promptHistoryIndex > history.length) promptHistoryIndex = history.length;

  if (promptHistoryIndex === history.length) {
    setPromptInput(promptHistoryDraft);
  } else {
    setPromptInput(history[promptHistoryIndex]);
  }
  return true;
}

function addMessageToSession(sessionId, role, text, images = []) {
  const session = sessions.find((candidate) => candidate.id === sessionId);
  if (!session) return Promise.resolve();
  session.messages.push({ role, text, images });
  if (role === "user" && session.messages.length === 1) {
    session.title = titleFromPrompt(text);
  }
  session.updatedAt = Date.now();
  sessions = [
    session,
    ...sessions.filter((candidate) => candidate.id !== sessionId),
  ];
  const saved = saveSessions();
  renderRecents();
  return saved;
}

function renderImagePreviews() {
  renderImagePreviewList(imagePreviewList, attachedImages, (index) => {
    attachedImages.splice(index, 1);
    renderImagePreviews();
    promptInput.focus();
  });
}

async function addImages(files) {
  for (const file of files) {
    if (!file.type.startsWith("image/")) continue;
    if (file.size > MAX_IMAGE_BYTES) {
      addEvent("Image skipped", `${file.name} is larger than 8 MB`);
      continue;
    }
    attachedImages.push({
      name: file.name,
      type: file.type,
      dataUrl: await readFileAsDataUrl(file),
    });
  }
  renderImagePreviews();
  promptInput.focus();
}

function resizePromptInput() {
  promptInput.style.height = "26px";
  promptInput.style.height = `${Math.min(promptInput.scrollHeight, 168)}px`;
  promptInput.style.overflowY = promptInput.scrollHeight > 168 ? "auto" : "hidden";
}

function setState(label, className) {
  socketState.textContent = label;
  socketState.className = `state ${className}`;
}

function setBusy(value) {
  runActive = value;
  sendButton.disabled = value || !socketService?.isOpen;
  promptInput.disabled = value;
  workspaceInput.disabled = value;
  renderSessionActivity();
}

function scrollToEnd(element) {
  element.scrollTop = element.scrollHeight;
}

function renderMessage(role, text, images = [], workspace = defaultWorkspace) {
  emptyState?.remove();
  const article = document.createElement("article");
  article.className = `message message-${role}`;

  if (images.length > 0) {
    const gallery = document.createElement("div");
    gallery.className = "messageImages";
    for (const image of images) {
      const img = document.createElement("img");
      img.src = image.dataUrl;
      img.alt = image.name || "Attached image";
      gallery.append(img);
    }
    article.append(gallery);
  }

  const body = document.createElement("div");
  body.className = "messageBody";
  if (["agent", "assistant"].includes(role)) {
    appendMarkdown(body, text, {
      resolveLink: (href) => resolveWorkspaceMarkdownLink(workspace, href),
    });
  }
  else appendMessageText(body, text);

  article.append(body);
  messages.append(article);
  scrollToEnd(messages);
}

function startStreamingAnswer(sessionId) {
  streamingAnswer = { sessionId, text: "", body: null };
  if (sessionId !== activeSessionId) return;

  emptyState?.remove();
  const article = document.createElement("article");
  article.className = "message message-agent message-streaming";
  const body = document.createElement("p");
  article.append(body);
  messages.append(article);
  streamingAnswer.body = body;
  scrollToEnd(messages);
}

function appendStreamingAnswer(sessionId, text) {
  if (!streamingAnswer || streamingAnswer.sessionId !== sessionId) {
    startStreamingAnswer(sessionId);
  }
  streamingAnswer.text += text;
  if (streamingAnswer.body && sessionId === activeSessionId) {
    streamingAnswer.body.textContent = streamingAnswer.text;
    scrollToEnd(messages);
  }
}

function finishStreamingAnswer() {
  streamingAnswer = null;
}

function renderMessages() {
  messages.replaceChildren();
  const session = activeSession();
  if (!session || session.messages.length === 0) {
    messages.append(emptyState);
    renderSessionActivity();
    return;
  }
  const activities = sessionActivityRuns(session.events || []);
  const isAgentMessage = (message) => ["agent", "assistant"].includes(message.role);
  const agentMessageCount = session.messages.filter(isAgentMessage).length;
  const unmatchedAgentCount = Math.max(0, agentMessageCount - activities.length);
  let agentIndex = 0;
  let activityIndex = 0;
  for (const message of session.messages) {
    if (isAgentMessage(message)) {
      if (agentIndex >= unmatchedAgentCount && activityIndex < activities.length) {
        const isLatest = activityIndex === activities.length - 1;
        messages.append(createSessionActivityCard(activities[activityIndex], { active: isLatest && runActive }));
        activityIndex += 1;
      }
      agentIndex += 1;
    }
    renderMessage(message.role, message.text, message.images || [], session.workspace || defaultWorkspace);
  }
  while (activityIndex < activities.length) {
    const isLatest = activityIndex === activities.length - 1;
    messages.append(createSessionActivityCard(activities[activityIndex], { active: isLatest && runActive }));
    activityIndex += 1;
  }
}

function createSessionActivityCard(activity, { active = false } = {}) {
  const card = document.createElement("details");
  card.className = "sessionActivity";
  card.setAttribute("aria-label", "Session step summary");
  card.setAttribute("aria-live", "polite");
  const summary = document.createElement("summary");
  const eyebrow = document.createElement("span");
  eyebrow.className = "sessionActivityEyebrow";
  const current = document.createElement("strong");
  current.className = "currentSessionStep";
  const count = document.createElement("span");
  count.className = "sessionTaskCount";
  const chevron = document.createElement("span");
  chevron.className = "sessionActivityChevron";
  chevron.textContent = "›";
  chevron.setAttribute("aria-hidden", "true");
  summary.append(eyebrow, current, count, chevron);
  summary.addEventListener("click", (event) => {
    if (card.dataset.running === "true") event.preventDefault();
  });
  const list = document.createElement("ol");
  list.className = "sessionTaskList";
  card.append(summary, list);
  card.open = active && !activity.complete;
  updateSessionActivityCard(card, activity, { active });
  return card;
}

function formatCommandResponse(response) {
  if (response === undefined) return "Waiting for command response…";
  if (!response || typeof response !== "object") return String(response ?? "");
  const metadata = [];
  if (typeof response.ok === "boolean") metadata.push(`Status: ${response.ok ? "succeeded" : "failed"}`);
  if (response.exit_code !== undefined && response.exit_code !== null) metadata.push(`Exit code: ${response.exit_code}`);
  if (response.signal) metadata.push(`Signal: ${response.signal}`);
  const sections = [];
  if (response.stdout) sections.push(`stdout\n${String(response.stdout).replace(/\s+$/, "")}`);
  if (response.stderr) sections.push(`stderr\n${String(response.stderr).replace(/\s+$/, "")}`);
  if (response.error && !response.stderr) sections.push(`error\n${response.error}`);
  const knownKeys = new Set(["ok", "exit_code", "signal", "stdout", "stderr", "error"]);
  const additional = Object.fromEntries(Object.entries(response).filter(([key]) => !knownKeys.has(key)));
  if (Object.keys(additional).length) sections.push(`details\n${JSON.stringify(additional, null, 2)}`);
  if (sections.length === 0) sections.push("(no command output)");
  return [...metadata, ...sections].join("\n\n");
}

function createCommandDetails(task) {
  const details = document.createElement("details");
  details.className = "sessionCommandDetails";
  details.open = task.response?.ok === false;
  const summary = document.createElement("summary");
  const command = document.createElement("code");
  command.textContent = `$ ${task.command || "(command unavailable)"}`;
  const hint = document.createElement("span");
  hint.textContent = task.response === undefined ? "Running…" : "Command response";
  summary.append(command, hint);
  const response = document.createElement("pre");
  response.textContent = formatCommandResponse(task.response);
  details.append(summary, response);
  return details;
}

function updateSessionActivityCard(card, activity, { active = false } = {}) {
  const wasComplete = card.dataset.complete === "true";
  const isRunning = active && !activity.complete;
  const failed = activity.items.some((item) => item.status === "failed");
  const eyebrow = card.querySelector(".sessionActivityEyebrow");
  const current = card.querySelector(".currentSessionStep");
  const count = card.querySelector(".sessionTaskCount");
  const list = card.querySelector(".sessionTaskList");
  eyebrow.textContent = isRunning ? "Current step" : "Step summary";
  current.textContent = isRunning ? activity.current?.label || "Working…" : failed ? "Run completed with errors" : "Run completed";
  current.dataset.state = isRunning ? "running" : failed ? "failed" : "idle";
  const taskCount = `${activity.items.length} task${activity.items.length === 1 ? "" : "s"}`;
  count.textContent = activity.usage
    ? `${taskCount} · ${formatTokenCount(activity.usage.totalTokens)} tokens`
    : taskCount;
  count.title = activity.usage
    ? `${formatTokenCount(activity.usage.inputTokens)} input · ${formatTokenCount(activity.usage.outputTokens)} output · ${formatTokenCount(activity.usage.totalTokens)} total tokens`
    : "";
  list.replaceChildren(...activity.items.map((task) => {
    const item = document.createElement("li");
    item.className = `sessionTask sessionTask-${task.status}`;
    const marker = document.createElement("span");
    marker.className = "sessionTaskMarker";
    marker.setAttribute("aria-hidden", "true");
    marker.textContent = task.status === "running" ? "•" : task.status === "failed" ? "!" : "✓";
    const label = document.createElement("span");
    label.className = "sessionTaskLabel";
    label.textContent = task.label;
    const content = document.createElement("span");
    content.className = "sessionTaskContent";
    content.append(label);
    if (task.usage) {
      const tokens = document.createElement("span");
      tokens.className = "sessionTaskTokens";
      tokens.textContent = `${formatTokenCount(task.usage.inputTokens)} input · ${formatTokenCount(task.usage.outputTokens)} output`;
      tokens.title = `${formatTokenCount(task.usage.totalTokens)} total tokens`;
      content.append(tokens);
    }
    const duration = document.createElement("span");
    duration.className = "sessionTaskDuration";
    duration.textContent = formatStepDuration(task.durationMs);
    if (task.status === "running") {
      duration.dataset.running = "true";
      duration.dataset.startedAt = String(task.startedAt);
    }
    item.append(marker, content, duration);
    if (task.key === "tool:run_command") item.append(createCommandDetails(task));
    return item;
  }));
  card.dataset.running = String(isRunning);
  card.dataset.complete = String(activity.complete);
  if (isRunning) card.open = true;
  else if (activity.complete && !wasComplete) card.open = false;
}

function refreshRunningStepDurations() {
  messages.querySelectorAll('.sessionTaskDuration[data-running="true"]').forEach((duration) => {
    duration.textContent = formatStepDuration(Date.now() - Number(duration.dataset.startedAt));
  });
}

function renderSessionActivity() {
  const activities = sessionActivityRuns(activeSession()?.events || []);
  const cards = [...messages.querySelectorAll(".sessionActivity")];
  if (activities.length === 0) {
    cards.forEach((card) => card.remove());
    return;
  }
  let card = cards.at(-1);
  if (cards.length < activities.length) {
    card = createSessionActivityCard(activities.at(-1), { active: runActive });
    const streamingMessage = messages.querySelector(".message-streaming");
    if (streamingMessage) messages.insertBefore(card, streamingMessage);
    else messages.append(card);
  } else {
    updateSessionActivityCard(card, activities.at(-1), { active: runActive });
  }
  const streamingResponse = messages.querySelector(".message-streaming");
  if (streamingResponse) {
    messages.insertBefore(card, streamingResponse);
  } else if (activities.at(-1).complete) {
    const responses = [...messages.querySelectorAll(".message-agent, .message-assistant")];
    const finalResponse = responses.at(-1);
    if (finalResponse) messages.insertBefore(card, finalResponse);
  }
  if (runActive) scrollToEnd(messages);
}

function renderRecents() {
  recentsList.replaceChildren();
  if (sessions.length === 0) {
    const empty = document.createElement("p");
    empty.className = "emptyRecents";
    empty.textContent = "No recent chats";
    recentsList.append(empty);
    return;
  }

  for (const session of sessions) {
    const row = document.createElement("div");
    row.className = "recentRow";
    const button = document.createElement("button");
    button.type = "button";
    button.title = session.title || "New chat";
    button.className = session.id === activeSessionId ? "active" : "";
    const label = document.createElement("span");
    label.className = "navLabel";
    label.textContent = session.title || "New chat";
    button.append(label);
    button.addEventListener("click", () => {
      if (runActive || session.id === activeSessionId) return;
      activeSessionId = session.id;
      persistUiState({ activeSessionId });
      renderRecents();
      renderMessages();
      renderEvents();
      renderWorkspace();
      loadWorkspaceTree();
      addEvent("Opened recent chat", session.title);
    });
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "deleteConversationButton";
    deleteButton.title = `Delete ${session.title || "conversation"}`;
    deleteButton.setAttribute("aria-label", `Delete ${session.title || "conversation"}`);
    deleteButton.textContent = "×";
    deleteButton.addEventListener("click", () => {
      if (runActive && session.id === activeSessionId) return;
      if (!window.confirm(`Delete conversation “${session.title || "New chat"}”?`)) return;
      const deletingActive = session.id === activeSessionId;
      sessions = sessions.filter((candidate) => candidate.id !== session.id);
      if (sessions.length === 0) sessions = [createSession("AI Harness Session", defaultWorkspace)];
      if (deletingActive) activeSessionId = sessions[0].id;
      persistUiState({ sessions, activeSessionId });
      send({ type: "reset", sessionId: session.id });
      renderRecents();
      renderMessages();
      renderEvents();
      renderWorkspace();
      loadWorkspaceTree();
    });
    row.append(button, deleteButton);
    recentsList.append(row);
  }
}

function startNewChat() {
  if (runActive) return;
  const session = createSession("New chat", defaultWorkspace);
  sessions = [session, ...sessions];
  activeSessionId = session.id;
  persistUiState({ sessions, activeSessionId });
  renderRecents();
  renderMessages();
  renderWorkspace();
  renderEvents();
  loadWorkspaceTree();
  addEvent("New chat started");
}

function renderEvent({ title, detail, timestamp }) {
  appendEvent(eventList, { title, detail, timestamp });
}

function renderEvents() {
  renderEventList(eventList, activeSession()?.events || []);
  renderSessionActivity();
}

function addEvent(title, detail, { persist = true } = {}) {
  const event = { title, detail, timestamp: Date.now() };
  renderEvent(event);
  const session = activeSession();
  if (!persist || !session) return;
  session.events ||= [];
  session.events.push(event);
  session.events = session.events.slice(-500);
  session.updatedAt = Date.now();
  saveSessions();
  renderSessionActivity();
}

function send(payload) {
  socketService?.send(payload);
}

function currentProviderSettings() {
  return {
    provider: providerSelect.value,
    model: providerModelInput.value.trim(),
    baseUrl: providerBaseUrlInput.value.trim(),
    apiKey: providerApiKeyInput.value.trim(),
  };
}

function providerFormRecord(existing = {}) {
  return {
    id: existing.id || crypto.randomUUID(),
    name: providerNameInput.value.trim() || `${providerSelect.value} provider`,
    type: providerSelect.value,
    model: providerModelInput.value.trim(),
    baseUrl: providerBaseUrlInput.value.trim(),
    apiKey: providerApiKeyInput.value.trim(),
    selected: existing.selected === true,
  };
}

function renderProvidersTable() {
  providersTableBody.replaceChildren();
  if (providers.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 6;
    cell.textContent = "No providers saved. Configure one below and choose Add provider.";
    row.append(cell);
    providersTableBody.append(row);
    return;
  }
  for (const item of providers) {
    const row = document.createElement("tr");
    row.classList.toggle("selected", item.selected === true);
    const selectCell = document.createElement("td");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = item.selected === true;
    checkbox.setAttribute("aria-label", `Use ${item.name}`);
    checkbox.addEventListener("change", () => {
      providers = providers.map((provider) => ({ ...provider, selected: provider.id === item.id }));
      providerSettings = { provider: item.type, model: item.model, baseUrl: item.baseUrl, apiKey: item.apiKey };
      editingProviderId = item.id;
      persistUiState({ providers });
      renderProvidersTable();
      renderProviderSettings(providerSettings, item.name);
      send({ type: "provider_settings", ...providerSettings });
    });
    selectCell.append(checkbox);
    row.append(selectCell);
    for (const value of [item.name, item.type, item.model || "Default"]) {
      const cell = document.createElement("td"); cell.textContent = value; row.append(cell);
    }
    const apiKeyCell = document.createElement("td");
    apiKeyCell.className = "providerKeyStatus";
    apiKeyCell.textContent = item.type === "ollama" ? "Not required" : item.apiKey ? "••••••••" : "Not set";
    row.append(apiKeyCell);
    const actionCell = document.createElement("td");
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.textContent = "Edit";
    editButton.addEventListener("click", async () => {
      editingProviderId = item.id;
      renderProviderSettings({ provider: item.type, model: item.model, baseUrl: item.baseUrl, apiKey: item.apiKey }, item.name);
      providerSettingsSection.classList.add("editor-open");
      providerEditor.hidden = false;
      saveSettingsButton.hidden = false;
      await loadProviderModels();
    });
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "providerDeleteButton";
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", () => {
      if (!window.confirm(`Delete provider “${item.name}”?`)) return;
      const deletedSelectedProvider = item.selected === true;
      providers = providers.filter((provider) => provider.id !== item.id);
      if (deletedSelectedProvider && providers.length > 0) {
        providers = providers.map((provider, index) => ({ ...provider, selected: index === 0 }));
        const next = providers[0];
        providerSettings = {
          provider: next.type, model: next.model, baseUrl: next.baseUrl, apiKey: next.apiKey,
        };
        send({ type: "provider_settings", ...providerSettings });
      } else if (deletedSelectedProvider) {
        providerSettings = defaultProviderSettings();
        send({ type: "provider_settings", ...providerSettings });
      }
      if (editingProviderId === item.id) editingProviderId = null;
      persistUiState({ providers });
      renderProvidersTable();
      settingsStatus.textContent = `${item.name} deleted`;
      settingsStatus.dataset.state = "success";
    });
    actionCell.append(editButton, deleteButton);
    row.append(actionCell);
    providersTableBody.append(row);
  }
}

function addProvider() {
  editingProviderId = null;
  renderProviderSettings(defaultProviderSettings(), "");
  providerSettingsSection.classList.add("editor-open");
  providerEditor.hidden = false;
  saveSettingsButton.hidden = false;
  settingsStatus.textContent = "Configure the new provider, then save.";
  settingsStatus.dataset.state = "";
  providerNameInput.focus();
}

function saveProviderSettings() {
  const settings = currentProviderSettings();
  const editing = providers.find((item) => item.id === editingProviderId);
  if (editing) {
    providers = providers.map((item) => item.id === editing.id ? providerFormRecord(item) : item);
  } else {
    const record = providerFormRecord({ selected: providers.length === 0 });
    providers.push(record);
    editingProviderId = record.id;
  }
  persistUiState(providers.length > 0 ? { providers } : { providerSettings: settings });
  renderProvidersTable();
  const updated = providers.find((item) => item.id === editingProviderId);
  if (!updated || updated.selected) {
    providerSettings = settings;
    send({ type: "provider_settings", ...settings });
    workspaceMeta.textContent = `${settings.provider} · ${settings.model || "default model"}`;
  }
  settingsStatus.textContent = "Provider settings saved";
  settingsStatus.dataset.state = "success";
  providerEditor.hidden = true;
  providerSettingsSection.classList.remove("editor-open");
  saveSettingsButton.hidden = true;
}

function currentToolPermissions() {
  const permissions = normalizeToolPermissions();
  for (const input of toolPermissionInputs) {
    permissions[input.dataset.toolPermission] = input.checked;
  }
  return permissions;
}

function renderToolPermissions(settings = storedToolPermissions) {
  const permissions = normalizeToolPermissions(settings);
  for (const input of toolPermissionInputs) {
    input.checked = permissions[input.dataset.toolPermission] === true;
  }
}

function saveToolPermissions() {
  const permissions = currentToolPermissions();
  storedToolPermissions = permissions;
  persistUiState({ toolPermissions: permissions });
  send({ type: "tool_permissions", permissions });
  toolPermissionsStatus.textContent = "Tool permissions saved";
  toolPermissionsStatus.dataset.state = "success";
}

function defaultModelForProvider(provider) {
  if (provider === "custom") return "custom-model";
  return provider === "ollama" ? "llama3.1" : "gpt-5.1-codex";
}

function setProviderModelsStatus(message, state = "") {
  providerModelsStatus.textContent = message;
  providerModelsStatus.dataset.state = state;
}

function setModelOptions(models, selectedModel) {
  const selected = selectedModel || defaultModelForProvider(providerSelect.value);
  providerModelInput.replaceChildren();
  const uniqueModels = [...new Set([selected, ...models].filter(Boolean))];
  for (const model of uniqueModels) {
    const option = document.createElement("option");
    option.value = model;
    option.textContent = model;
    providerModelInput.append(option);
  }
  providerModelInput.value = selected;
}

function renderProviderSettings(settings = providerSettings, name = providers.find((item) => item.selected)?.name || "") {
  providerNameInput.value = name;
  providerSelect.value = ["openai", "ollama", "custom"].includes(settings.provider)
    ? settings.provider
    : "openai";
  setModelOptions([], settings.model || defaultModelForProvider(providerSelect.value));
  providerBaseUrlInput.value = settings.baseUrl || "";
  providerApiKeyInput.value = settings.apiKey || "";
  providerBaseUrlInput.placeholder = providerSelect.value === "ollama"
    ? "http://localhost:11434"
    : providerSelect.value === "custom"
      ? "http://localhost:8000/v1"
      : "https://api.openai.com/v1";
  providerApiKeyField.hidden = providerSelect.value === "ollama";
  providerApiKeyInput.placeholder = providerSelect.value === "openai"
    ? "Required OpenAI API key"
    : "Optional bearer token";
}

async function loadProviderModels() {
  const current = currentProviderSettings();
  setProviderModelsStatus("Loading models...");
  refreshModelsButton.disabled = true;
  try {
    const payload = await fetchProviderModels(current);
    setModelOptions(payload.models || [], current.model);
    setProviderModelsStatus(`${payload.models.length} model${payload.models.length === 1 ? "" : "s"} loaded`, "success");
  } catch (error) {
    setModelOptions([], current.model || defaultModelForProvider(current.provider));
    setProviderModelsStatus(error.message, "error");
  } finally {
    refreshModelsButton.disabled = false;
  }
}

function setConfigStatus(message, state = "") {
  configStatus.textContent = message;
  configStatus.dataset.state = state;
}

function appendConfigTemplate(template) {
  const prefix = configInput.value.trimEnd();
  configInput.value = `${prefix}${prefix ? "\n\n" : ""}${template.trimStart()}`;
  configInput.focus();
}

async function loadConfig() {
  setConfigStatus("Loading...");
  reloadConfigButton.disabled = true;
  try {
    const payload = await fetchConfig();
    configInput.value = payload.content;
    setConfigStatus(payload.exists ? "Loaded MCP configuration from SQLite" : "No MCP configuration yet");
  } catch (error) {
    setConfigStatus(error.message, "error");
  } finally {
    reloadConfigButton.disabled = false;
  }
}

async function saveConfig() {
  setConfigStatus("Saving...");
  saveConfigButton.disabled = true;
  try {
    const payload = await persistConfig(configInput.value);
    setConfigStatus(`Saved ${payload.path}`, "success");
    addEvent("Config saved", `${payload.path} (${payload.bytes} bytes)`);
  } catch (error) {
    setConfigStatus(error.message, "error");
  } finally {
    saveConfigButton.disabled = false;
  }
}

async function saveConfigContent(content) {
  const payload = await persistConfig(content);
  send({ type: "reload_tools" });
  configInput.value = content;
  return payload;
}

function toolSnippet() {
  const label = toolLabelInput.value.trim();
  if (!/^[A-Za-z0-9_-]+$/.test(label)) {
    throw new Error("Label must contain only letters, numbers, _ or -.");
  }

  if (toolTypeSelect.value === "remote") {
    const url = toolUrlInput.value.trim();
    if (!url) throw new Error("Server URL is required.");
    return `[[mcp.servers]]
server_label = "${quoteToml(label)}"
server_url = "${quoteToml(url)}"
require_approval = "never"`;
  }

  const command = toolCommandInput.value.trim();
  if (!command) throw new Error("Command is required.");
  const args = toolArgsInput.value
    .split(/\s+/)
    .map((arg) => arg.trim())
    .filter(Boolean)
    .map((arg) => `"${quoteToml(arg)}"`)
    .join(", ");
  const cwd = toolCwdInput.value.trim();
  return `[mcp_servers.${label}]
command = "${quoteToml(command)}"
args = [${args}]${cwd ? `\ncwd = "${quoteToml(cwd)}"` : ""}
message_format = "content-length"
require_approval = "never"`;
}

function setToolsStatus(message, state = "") {
  toolsStatus.textContent = message;
  toolsStatus.dataset.state = state;
}

function renderToolTypeFields() {
  const remote = toolTypeSelect.value === "remote";
  document.querySelectorAll(".remoteToolField").forEach((field) => {
    field.hidden = !remote;
  });
  document.querySelectorAll(".stdioToolField").forEach((field) => {
    field.hidden = remote;
  });
}

function clearMcpEditor() {
  editingMcpBlock = null;
  toolTypeSelect.value = "remote";
  toolTypeSelect.disabled = false;
  toolLabelInput.value = "";
  toolUrlInput.value = "";
  toolCommandInput.value = "";
  toolArgsInput.value = "";
  toolCwdInput.value = "";
  mcpEditorTitle.textContent = "Add MCP server";
  mcpEditor.setAttribute("aria-label", "Add MCP server");
  addToolButton.textContent = "Add server";
  renderToolTypeFields();
}

function openMcpEditor(block = null) {
  clearMcpEditor();
  editingMcpBlock = block;
  if (block) {
    toolTypeSelect.value = block.type;
    toolTypeSelect.disabled = true;
    toolLabelInput.value = block.label;
    toolUrlInput.value = block.url;
    toolCommandInput.value = block.command;
    toolArgsInput.value = block.args.join(" ");
    toolCwdInput.value = block.cwd;
    mcpEditorTitle.textContent = `Edit ${block.label}`;
    mcpEditor.setAttribute("aria-label", `Edit ${block.label}`);
    addToolButton.textContent = "Save changes";
  }
  mcpEditor.hidden = false;
  mcpTableToolbar.hidden = true;
  toolsListPanel.hidden = true;
  renderToolTypeFields();
  toolLabelInput.focus();
}

function closeMcpEditor() {
  clearMcpEditor();
  mcpEditor.hidden = true;
  mcpTableToolbar.hidden = false;
  toolsListPanel.hidden = false;
}

function renderTools() {
  const blocks = mcpBlocks(toolsConfigContent);
  toolsList.replaceChildren();
  if (blocks.length === 0) {
    const empty = document.createElement("p");
    empty.className = "emptyTools";
    empty.textContent = "No MCP servers configured.";
    toolsList.append(empty);
    return;
  }

  for (const block of blocks) {
    const row = document.createElement("article");
    row.className = "toolRow";

    const title = document.createElement("strong");
    title.textContent = block.label;
    const type = document.createElement("span");
    type.textContent = block.type;
    const detail = document.createElement("span");
    detail.textContent = block.detail;

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = `toggleButton ${block.enabled ? "enabled" : ""}`;
    toggle.textContent = block.enabled ? "On" : "Off";
    toggle.addEventListener("click", async () => {
      setToolsStatus(`${block.enabled ? "Disabling" : "Enabling"} ${block.label}...`);
      try {
        toolsConfigContent = setToolBlockEnabled(toolsConfigContent, block, !block.enabled);
        await saveConfigContent(toolsConfigContent);
        renderTools();
        setToolsStatus(`${block.label} ${block.enabled ? "disabled" : "enabled"}`, "success");
      } catch (error) {
        setToolsStatus(error.message, "error");
      }
    });

    const actions = document.createElement("div");
    actions.className = "mcpRowActions";
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "mcpEditButton";
    editButton.textContent = "Edit";
    editButton.setAttribute("aria-label", `Edit ${block.label}`);
    editButton.addEventListener("click", () => openMcpEditor(block));
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "mcpDeleteButton";
    deleteButton.textContent = "Delete";
    deleteButton.setAttribute("aria-label", `Delete ${block.label}`);
    deleteButton.addEventListener("click", async () => {
      if (!window.confirm(`Delete MCP server “${block.label}”?`)) return;
      deleteButton.disabled = true;
      setToolsStatus(`Deleting ${block.label}...`);
      try {
        const nextContent = replaceToolBlock(toolsConfigContent, block);
        await saveConfigContent(nextContent);
        toolsConfigContent = nextContent;
        renderTools();
        setToolsStatus(`${block.label} deleted`, "success");
      } catch (error) {
        deleteButton.disabled = false;
        setToolsStatus(error.message, "error");
      }
    });
    actions.append(editButton, deleteButton);

    row.append(title, type, detail, toggle, actions);
    toolsList.append(row);
  }
}

async function loadTools() {
  setToolsStatus("Loading...");
  reloadToolsButton.disabled = true;
  try {
    const payload = await fetchConfig();
    toolsConfigContent = payload.content;
    renderTools();
    setToolsStatus(payload.exists ? "Loaded MCP servers" : "No config file yet");
  } catch (error) {
    setToolsStatus(error.message, "error");
  } finally {
    reloadToolsButton.disabled = false;
  }
}

async function saveTool() {
  const action = editingMcpBlock ? "Saving changes..." : "Adding server...";
  setToolsStatus(action);
  addToolButton.disabled = true;
  try {
    const duplicate = mcpBlocks(toolsConfigContent).find((block) =>
      block.label === toolLabelInput.value.trim() && block.index !== editingMcpBlock?.index
    );
    if (duplicate) throw new Error(`An MCP server named ${duplicate.label} already exists.`);
    const snippet = toolSnippet();
    const nextContent = editingMcpBlock
      ? updateToolBlock(toolsConfigContent, editingMcpBlock, snippet)
      : `${toolsConfigContent.trimEnd()}${toolsConfigContent.trim() ? "\n\n" : ""}${snippet}\n`;
    const savedLabel = toolLabelInput.value.trim();
    const edited = Boolean(editingMcpBlock);
    await saveConfigContent(nextContent);
    toolsConfigContent = nextContent;
    renderTools();
    closeMcpEditor();
    setToolsStatus(`${savedLabel} ${edited ? "updated" : "added"}`, "success");
  } catch (error) {
    setToolsStatus(error.message, "error");
  } finally {
    addToolButton.disabled = false;
  }
}

async function loadHealth() {
  try {
    const health = await fetchHealth();
    defaultWorkspace = health.workspace || ".";
    let changed = false;
    for (const session of sessions) {
      if (!session.workspace || session.workspace === ".") {
        session.workspace = defaultWorkspace;
        changed = true;
      }
    }
    if (changed) saveSessions();
    renderWorkspace();
    const settings = providerSettings;
    workspaceMeta.textContent = `${settings.provider || health.provider} · ${settings.model || health.model}`;
  } catch {
    workspaceMeta.textContent = "Server health unavailable";
  }
}

async function handleSocketMessage(payload) {
    if (payload.type === "ready") {
      addEvent("Server defaults", {
        provider: payload.provider,
        model: payload.model,
        approveAll: payload.approveAll,
      });
      return;
    }
    if (payload.type === "provider_settings") {
      addEvent("Agent session ready", {
        provider: payload.provider,
        model: payload.model,
        baseUrl: payload.baseUrl,
      });
      return;
    }
    if (payload.type === "tool_permissions") {
      addEvent("Tool permissions updated", payload.permissions);
      return;
    }
    if (payload.type === "reload_tools") {
      addEvent("Tools reloaded");
      return;
    }
    if (payload.type === "reload_skills") {
      addEvent("Skills reloaded");
      return;
    }
    if (payload.type === "info") {
      addEvent(payload.message);
      return;
    }
    if (payload.type === "tool") {
      addEvent(`Tool call: ${payload.name}`, payload.args);
      return;
    }
    if (payload.type === "agent_event") {
      addEvent(describeAgentEvent(payload.event), payload.event);
      return;
    }
    if (payload.type === "answer_start") {
      startStreamingAnswer(payload.sessionId || pendingSessionId || activeSessionId);
      addEvent("Writing response", { type: "response_stream" });
      return;
    }
    if (payload.type === "answer_delta") {
      appendStreamingAnswer(payload.sessionId || pendingSessionId || activeSessionId, payload.text || "");
      return;
    }
    if (payload.type === "done") {
      const targetSessionId = payload.sessionId || pendingSessionId || activeSessionId;
      addEvent("Response completed", { type: "response_complete" });
      const saved = addMessageToSession(targetSessionId, "agent", payload.text);
      if (targetSessionId === activeSessionId) renderMessages();
      finishStreamingAnswer();
      await saved;
      pendingSessionId = null;
      setBusy(false);
      return;
    }
    if (payload.type === "reset") {
      addEvent("Conversation reset");
      return;
    }
    if (payload.type === "error") {
      const targetSessionId = payload.sessionId || pendingSessionId || activeSessionId;
      addMessageToSession(targetSessionId, "agent", payload.error);
      if (targetSessionId === activeSessionId) renderMessages();
      addEvent("Error", payload.error);
      setState("Error", "state-error");
      finishStreamingAnswer();
      pendingSessionId = null;
      setBusy(false);
    }
}

function connect() {
  setState("Connecting", "state-pending");
  socketService = new SocketService({
    onOpen() {
      setState("Online", "state-online");
      send({ type: "provider_settings", ...providerSettings });
      send({ type: "tool_permissions", permissions: storedToolPermissions });
      setBusy(false);
      addEvent("Socket connected");
    },
    onClose() {
      setState("Offline", "state-idle");
      setBusy(false);
      addEvent("Socket closed");
      window.setTimeout(connect, 1500);
    },
    onError() {
      setState("Error", "state-error");
      addEvent("Socket error");
    },
    onMessage: handleSocketMessage,
  });
  socketService.connect();
}

chatComponent.addEventListener("submit-prompt", () => {
  const prompt = promptInput.value.trim();
  if ((!prompt && attachedImages.length === 0) || runActive) return;
  const sessionId = activeSessionId;
  const session = activeSession();
  const history = session ? session.messages.slice(-20) : [];
  const images = attachedImages;
  const displayPrompt = prompt || "Analyze attached image";
  addMessageToSession(
    sessionId,
    "user",
    displayPrompt,
    images,
  );
  renderMessages();
  addEvent("Prompt sent", images.length > 0 ? `${displayPrompt} (${images.length} image)` : displayPrompt);
  promptInput.value = "";
  attachedImages = [];
  renderImagePreviews();
  resetPromptHistoryCursor();
  resizePromptInput();
  setBusy(true);
  pendingSessionId = sessionId;
  send({
    type: "prompt",
    prompt: displayPrompt,
    sessionId,
    history,
    images,
    workspace: session?.workspace || defaultWorkspace,
  });
});

workspaceComponent.addEventListener("workspace-change", saveActiveWorkspace);
workspaceComponent.addEventListener("focus-prompt", () => promptInput.focus());
workspaceComponent.addEventListener("refresh-workspace", loadWorkspaceTree);
workspaceComponent.addEventListener("choose-workspace", openWorkspacePicker);
workspacePickerModal.addEventListener("create-workspace", openCreateWorkspaceDialog);
createWorkspaceModal.addEventListener("create-workspace-confirm", createAndSelectWorkspace);
chatComponent.addEventListener("images-selected", async (event) => addImages(event.detail.files));
chatComponent.addEventListener("prompt-edited", resetPromptHistoryCursor);
chatComponent.addEventListener("navigate-prompt-history", (event) => navigatePromptHistory(event.detail.direction));
chatComponent.addEventListener("toggle-column", (event) => toggleRightColumn(event.detail.column));
sidebarComponent.addEventListener("new-chat", startNewChat);
sidebarComponent.addEventListener("toggle-sidebar", toggleSidebar);

sidebarResizeHandle.addEventListener("column-resize-start", (event) => startSidebarResize(event.detail.sourceEvent));
sidebarResizeHandle.addEventListener("column-resize-key", (event) => {
  if (appShell.classList.contains("sidebar-collapsed")) {
    applySidebarState(false);
    persistUiState({ sidebarCollapsed: false });
  }
  setSidebarWidth(sidebarWidth + (event.detail.key === "ArrowLeft" ? -24 : 24));
});

streamResizeHandle.addEventListener("column-resize-start", (event) => startStreamResize(event.detail.sourceEvent));
streamResizeHandle.addEventListener("column-resize-key", (event) => {
  setStreamWidth(streamWidth + (event.detail.key === "ArrowLeft" ? 24 : -24));
});
filesResizeHandle.addEventListener("column-resize-start", (event) => startFilesResize(event.detail.sourceEvent));
filesResizeHandle.addEventListener("column-resize-key", (event) => {
  setFilesWidth(filesWidth + (event.detail.key === "ArrowLeft" ? 24 : -24));
});
workspacePickerModal.addEventListener("workspace-picker-parent", async () => {
  if (!workspacePickerParent) return;
  try { await loadWorkspacePickerRoot(workspacePickerParent); } catch (error) { workspacePickerPath.textContent = error.message; }
});
workspacePickerModal.addEventListener("workspace-picker-confirm", () => {
  if (!pendingWorkspacePath) return;
  workspaceInput.value = pendingWorkspacePath;
  workspacePickerDialog.close();
  saveActiveWorkspace();
});
window.addEventListener("resize", () => {
  setStreamWidth(streamWidth);
  setFilesWidth(filesWidth);
});

function openProvidersModal() {
  renderProvidersTable();
  providerSettingsSection.classList.remove("editor-open");
  providerEditor.hidden = true;
  saveSettingsButton.hidden = true;
  settingsStatus.textContent = "Provider settings are stored in SQLite.";
  settingsStatus.dataset.state = "";
  if (!settingsDialog.open) settingsDialog.showModal();
}

sidebarComponent.addEventListener("open-modal", async (event) => {
  if (event.detail.modal === "providers") openProvidersModal();
  if (event.detail.modal === "presets") {
    presetsDialog.showModal();
    await loadPresets();
  }
  if (event.detail.modal === "system-prompts") {
    systemPromptEditor.hidden = true; systemPromptsList.hidden = false; saveSystemPromptButton.hidden = true;
    systemPromptsDialog.showModal();
    try { await loadSystemPrompts(); } catch (error) { systemPromptsStatus.textContent = error.message; systemPromptsStatus.dataset.state = "error"; }
  }
  if (event.detail.modal === "skills") {
    closeSkillEditor();
    skillsSearchInput.value = "";
    skillsDialog.showModal();
    skillsStatus.textContent = "Loading skills from SQLite..."; skillsStatus.dataset.state = "";
    try { await loadSkills(); skillsStatus.textContent = "Skill selections are stored in SQLite."; skillsStatus.dataset.state = ""; } catch (error) { skillsStatus.textContent = error.message; skillsStatus.dataset.state = "error"; }
  }
  if (event.detail.modal === "tools") {
    toolsDialog.showModal(); renderToolPermissions();
    toolPermissionsStatus.textContent = "Tool permissions are stored in SQLite."; toolPermissionsStatus.dataset.state = "";
  }
  if (event.detail.modal === "mcp") {
    mcpDialog.showModal(); closeMcpEditor(); await loadTools();
  }
});

systemPromptsModal.addEventListener("save-system-prompt", async () => {
  try { await saveSystemPrompt(); } catch (error) { systemPromptsStatus.textContent = error.message; systemPromptsStatus.dataset.state = "error"; }
});
skillsModal.addEventListener("save-skills", async () => {
  try { await saveSkills(); } catch (error) { skillsStatus.textContent = error.message; skillsStatus.dataset.state = "error"; }
});
skillsModal.addEventListener("search-skills", renderSkills);
skillsModal.addEventListener("create-skill", () => openSkillEditor());
skillsModal.addEventListener("cancel-skill-edit", closeSkillEditor);
skillsModal.addEventListener("save-skill-edit", saveSkillEdit);
providersModal.addEventListener("refresh-provider-models", loadProviderModels);
providersModal.addEventListener("add-provider", addProvider);
mcpModal.addEventListener("reload-mcp-config", loadConfig);
mcpModal.addEventListener("save-mcp-config", saveConfig);
mcpModal.addEventListener("reload-mcp-tools", loadTools);
mcpModal.addEventListener("show-mcp-editor", () => openMcpEditor());
mcpModal.addEventListener("cancel-mcp-editor", closeMcpEditor);
providersModal.addEventListener("save-provider-settings", saveProviderSettings);
toolsModal.addEventListener("save-tool-permissions", saveToolPermissions);
presetsModal.addEventListener("create-preset", duplicateActivePreset);
presetsModal.addEventListener("cancel-preset-edit", closePresetEditor);
presetsModal.addEventListener("save-preset-edit", savePresetEdit);
presetsModal.addEventListener("preset-mcp-type-change", renderPresetMcpTypeFields);
presetsModal.addEventListener("add-preset-mcp-server", addPresetMcpServer);
mcpModal.addEventListener("add-mcp-tool", saveTool);
mcpModal.addEventListener("mcp-type-change", renderToolTypeFields);
providersModal.addEventListener("provider-type-change", async () => {
  const nextProvider = providerSelect.value;
  const providerName = providerNameInput.value;
  if (!providerBaseUrlInput.value || /api\.openai\.com|localhost:11434/.test(providerBaseUrlInput.value)) {
    providerBaseUrlInput.value = nextProvider === "ollama"
      ? "http://localhost:11434"
      : nextProvider === "custom"
        ? "http://localhost:8000/v1"
        : "";
  }
  setModelOptions([], defaultModelForProvider(nextProvider));
  renderProviderSettings(currentProviderSettings(), providerName);
  await loadProviderModels();
});

mcpModal.addEventListener("append-mcp-template", (event) => {
  appendConfigTemplate(CONFIG_TEMPLATES[event.detail.template]);
});

chatComponent.addEventListener("reset-chat", () => {
  const session = activeSession();
  if (session) {
    clearSessionHistory(session);
    saveSessions();
    renderRecents();
  }
  messages.replaceChildren();
  messages.append(emptyState);
  renderEvents();
  send({ type: "reset", sessionId: activeSessionId });
});

streamComponent.addEventListener("clear-stream", () => {
  const session = activeSession();
  if (session) {
    session.events = [];
    saveSessions();
  }
  renderEvents();
});

async function initialize() {
  let state = {};
  let shouldOpenProvidersModal = false;
  try {
    state = await loadUiState();
    sessions = Array.isArray(state.sessions) && state.sessions.length > 0
      ? state.sessions.map((session) => ({
        ...session,
        messages: Array.isArray(session.messages) ? session.messages : [],
        events: Array.isArray(session.events) ? session.events : [],
        workspace: session.workspace || defaultWorkspace,
      }))
      : [createSession("AI Harness Session", defaultWorkspace)];
    providerSettings = { ...defaultProviderSettings(), ...(state.providerSettings || {}) };
    providers = Array.isArray(state.providers) ? state.providers : [];
    shouldOpenProvidersModal = providers.length === 0;
    editingProviderId = providers.find((item) => item.selected)?.id || null;
    storedToolPermissions = normalizeToolPermissions(state.toolPermissions);
    const localSidebarWidth = Number(localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY));
    const localStreamWidth = Number(localStorage.getItem(STREAM_WIDTH_STORAGE_KEY));
    const localFilesWidth = Number(localStorage.getItem(FILES_WIDTH_STORAGE_KEY));
    sidebarWidth = Number.isFinite(localSidebarWidth) && localSidebarWidth > 0
      ? localSidebarWidth
      : 344;
    streamWidth = Number.isFinite(localStreamWidth) && localStreamWidth > 0
      ? localStreamWidth
      : 360;
    filesWidth = Number.isFinite(localFilesWidth) && localFilesWidth > 0 ? localFilesWidth : 300;
    applySidebarState(state.sidebarCollapsed === true);
    applyRightColumnState("files", localStorage.getItem(FILES_VISIBLE_STORAGE_KEY) !== "false");
    applyRightColumnState("stream", localStorage.getItem(STREAM_VISIBLE_STORAGE_KEY) !== "false");
  } catch (error) {
    sessions = [createSession("AI Harness Session", defaultWorkspace)];
    applySidebarState(false);
    addEvent("UI state load failed", error.message, { persist: false });
  }
  activeSessionId = sessions.some((session) => session.id === state?.activeSessionId)
    ? state.activeSessionId
    : sessions[0].id;
  setSidebarWidth(sidebarWidth);
  setStreamWidth(streamWidth);
  setFilesWidth(filesWidth);
  renderProviderSettings();
  renderToolPermissions();
  renderRecents();
  renderMessages();
  renderEvents();
  renderWorkspace();
  resizePromptInput();
  if (shouldOpenProvidersModal) openProvidersModal();
  await loadHealth();
  await loadWorkspaceTree();
  connect();
}

initialize();
setInterval(refreshRunningStepDurations, 1000);
