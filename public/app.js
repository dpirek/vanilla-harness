import { activityMessageIndices } from "./lib/session-activity.js";
import HarnessSidebar from "./components/harness-sidebar.js";
import HarnessChat from "./components/harness-chat.js";
import WorkspacePanel from "./components/workspace-panel.js";
import ColumnResizeHandle from "./components/column-resize-handle.js";
import { mountAppShell } from "./components/app-shell.js";
import { codeLanguageLabel, renderFilePreview } from "./lib/file-utils.js";
import { copyTextToClipboard } from "./lib/clipboard.js";
import { appendMarkdown, appendMessageText } from "./lib/message-rendering.js";
import {
  defaultProviderSettings,
  matchingProviderId,
  normalizeToolPermissions,
  providerSettingsFromRecord,
} from "./lib/settings.js";
import { normalizeRigComponentState } from "./lib/rig-presets.js";
import {
  CONFIG_TEMPLATES,
  formatHttpHeaders,
  httpHeadersToml,
  mcpBlocks,
  quoteToml,
  replaceToolBlock,
  setToolBlockEnabled,
  updateToolBlock,
} from "./lib/mcp-config.js";
import { describeAgentEvent } from "./lib/agent-events.js";
import { readFileAsDataUrl, renderImagePreviews as renderImagePreviewList } from "./lib/image-attachments.js";
import { randomUuid } from "./lib/ids.js";
import { bootstrapIcon, modelTestIcon } from "./lib/icons.js";
import { normalizeSkillName, skillDraft, syncSkillContentName, validateSkillContent } from "./lib/skill-content.js";
import { clearSessionHistory, createSession, promptHistoryFromSessions, titleFromPrompt } from "./lib/sessions.js";
import { calculateTokenCost, formatStepDuration, formatTokenCount, sessionActivityRuns } from "./lib/session-activity.js";
import { formatContextPercentage } from "./lib/model-context.js";
import {
  filterAndSortProviderModels,
  modelsRouteProviderId,
  modelsRoutePath,
  formatProviderModelValues,
  groupedProviderModels,
  mergeRefreshedProviderModels,
  normalizeProviderModels,
  providersNeedingInitialModelLoad,
} from "./lib/provider-models.js";
import { filterCommandOptions, parsePromptCommand } from "./lib/prompt-commands.js";
import { createStateSaveQueue } from "./lib/state-save-queue.js";
import { loadDefaultWorkspace, saveDefaultWorkspace } from "./lib/workspace-preferences.js";
import { shouldRefreshWorkspaceForAgentEvent } from "./lib/workspace-refresh.js";
import { createStepVisualization, updateStepVisualization } from "./lib/step-visualization.js";
import { renderWorkspaceNodes, renderWorkspacePicker } from "./lib/workspace-rendering.js";
import { loadUiState, saveUiState } from "./services/ui-state-api.js";
import {
  createConversationWorkspace,
  createWorkspaceFolder,
  deleteConversationWorkspace,
  isWorkspaceImagePath,
  loadWorkspaceFile,
  loadWorkspaceTree as fetchWorkspaceTree,
  resolveWorkspaceMarkdownLink,
  saveWorkspaceRecording,
  transcribeWorkspaceRecording,
  uploadWorkspaceFile,
  workspaceFileAssetUrl,
} from "./services/workspace-api.js";
import {
  createSkill as persistNewSkill,
  loadConfig as fetchConfig,
  loadHealth as fetchHealth,
  loadProviderModels as fetchProviderModels,
  loadRigConfigurations as fetchRigConfigurations,
  loadSkills as fetchSkills,
  loadSystemPrompts as fetchSystemPrompts,
  loadTaskRatings as fetchTaskRatings,
  saveConfig as persistConfig,
  saveRigConfigurations as persistRigConfigurations,
  saveSelectedSkills as persistSelectedSkills,
  saveSkill as persistSkill,
  saveSystemPrompt as persistSystemPrompt,
  saveTaskRating as persistTaskRating,
  testProviderModel as runProviderModelTest,
} from "./services/settings-api.js";
import SocketService from "./services/socket-service.js";

const appRoot = document.querySelector("ai-harness-app")?.shadowRoot || document;
const appShell = mountAppShell(appRoot);
const sidebarComponent = appRoot.querySelector("harness-sidebar");
const chatComponent = appRoot.querySelector("harness-chat");
const workspaceComponent = appRoot.querySelector("workspace-panel");
const workspacePickerModal = appRoot.querySelector("workspace-picker-modal");
const createWorkspaceModal = appRoot.querySelector("create-workspace-modal");
const providersModal = appRoot.querySelector("providers-modal");
const presetsModal = appRoot.querySelector("presets-modal");
const systemPromptsModal = appRoot.querySelector("system-prompts-modal");
const skillsModal = appRoot.querySelector("skills-modal");
const toolsModal = appRoot.querySelector("tools-modal");
const subAgentsModal = appRoot.querySelector("sub-agents-modal");
const mcpModal = appRoot.querySelector("mcp-modal");
const workflowModal = appRoot.querySelector("workflow-modal");

const workspaceMeta = appRoot.querySelector("#workspaceMeta");
const providerShortcutName = appRoot.querySelector("#providerShortcutName");
const providerShortcutModel = appRoot.querySelector("#providerShortcutModel");
const providerShortcutPrice = appRoot.querySelector("#providerShortcutPrice");
const workspaceInput = appRoot.querySelector("#workspaceInput");
const messages = appRoot.querySelector("#messages");
const promptInput = appRoot.querySelector("#promptInput");
const sendButton = appRoot.querySelector("#sendButton");
const microphoneButton = appRoot.querySelector("#microphoneButton");
const imagePreviewList = appRoot.querySelector("#imagePreviewList");
const emptyState = appRoot.querySelector("#emptyState");
const recentsList = appRoot.querySelector("#recentsList");
const settingsDialog = appRoot.querySelector("#settingsDialog");
const presetsDialog = appRoot.querySelector("#presetsDialog");
const presetsList = appRoot.querySelector("#presetsList");
const presetsCount = appRoot.querySelector("#presetsCount");
const presetsStatus = appRoot.querySelector("#presetsStatus");
const createPresetButton = appRoot.querySelector("#createPresetButton");
const presetsListView = appRoot.querySelector("#presetsListView");
const presetEditorForm = appRoot.querySelector("#presetEditorForm");
const presetsDialogTitle = appRoot.querySelector("#presetsDialogTitle");
const presetsDialogDescription = appRoot.querySelector("#presetsDialogDescription");
const backToPresetsButton = appRoot.querySelector("#backToPresetsButton");
const presetEditorName = appRoot.querySelector("#presetEditorName");
const presetEditorProvider = appRoot.querySelector("#presetEditorProvider");
const presetSkillsSearch = appRoot.querySelector("#presetSkillsSearch");
const presetSkillsList = appRoot.querySelector("#presetSkillsList");
const presetSystemPrompts = appRoot.querySelector("#presetSystemPrompts");
const presetMcpServerList = appRoot.querySelector("#presetMcpServerList");
const presetMcpType = appRoot.querySelector("#presetMcpType");
const presetMcpLabel = appRoot.querySelector("#presetMcpLabel");
const presetMcpUrlField = appRoot.querySelector("#presetMcpUrlField");
const presetMcpUrl = appRoot.querySelector("#presetMcpUrl");
const presetMcpHeadersField = appRoot.querySelector("#presetMcpHeadersField");
const presetMcpHeaders = appRoot.querySelector("#presetMcpHeaders");
const presetMcpCommand = appRoot.querySelector("#presetMcpCommand");
const presetMcpArgs = appRoot.querySelector("#presetMcpArgs");
const presetMcpCwd = appRoot.querySelector("#presetMcpCwd");
const presetMcpStdioFields = [...appRoot.querySelectorAll(".presetMcpStdioField")];
const presetMcpStatus = appRoot.querySelector("#presetMcpStatus");
const savePresetEditButton = appRoot.querySelector("#savePresetEditButton");
const workflowDialog = appRoot.querySelector("#workflowDialog");
const workflowDialogDescription = appRoot.querySelector("#workflowDialogDescription");
const workflowInputSource = appRoot.querySelector("#workflowInputSource");
const workflowStatus = appRoot.querySelector("#workflowStatus");
const saveWorkflowButton = appRoot.querySelector("#saveWorkflowButton");
const workflowEffectInputs = [...appRoot.querySelectorAll("[data-workflow-effect]")];
const systemPromptsDialog = appRoot.querySelector("#systemPromptsDialog");
const skillsDialog = appRoot.querySelector("#skillsDialog");
const systemPromptsList = appRoot.querySelector("#systemPromptsList");
const systemPromptEditor = appRoot.querySelector("#systemPromptEditor");
const systemPromptEditorTitle = appRoot.querySelector("#systemPromptEditorTitle");
const systemPromptContent = appRoot.querySelector("#systemPromptContent");
const systemPromptsStatus = appRoot.querySelector("#systemPromptsStatus");
const saveSystemPromptButton = appRoot.querySelector("#saveSystemPromptButton");
const skillsTableBody = appRoot.querySelector("#skillsTableBody");
const skillsSearchInput = appRoot.querySelector("#skillsSearchInput");
const skillsStatus = appRoot.querySelector("#skillsStatus");
const skillLibrary = appRoot.querySelector(".skillLibrary");
const skillEditor = appRoot.querySelector("#skillEditor");
const skillEditorName = appRoot.querySelector("#skillEditorName");
const skillEditorContent = appRoot.querySelector("#skillEditorContent");
const skillsDialogTitle = appRoot.querySelector("#skillsDialogTitle");
const skillsDialogDescription = appRoot.querySelector("#skillsDialogDescription");
const backToSkillsButton = appRoot.querySelector("#backToSkillsButton");
const toggleSkillColumnButton = appRoot.querySelector("#toggleSkillColumnButton");
const cancelSkillEditButton = appRoot.querySelector("#cancelSkillEditButton");
const saveSkillEditButton = appRoot.querySelector("#saveSkillEditButton");
const saveSkillsButton = appRoot.querySelector("#saveSkillsButton");
const configInput = appRoot.querySelector("#configInput");
const configStatus = appRoot.querySelector("#configStatus");
const saveConfigButton = appRoot.querySelector("#saveConfigButton");
const settingsStatus = appRoot.querySelector("#settingsStatus");
const reloadConfigButton = appRoot.querySelector("#reloadConfigButton");
const toolsDialog = appRoot.querySelector("#toolsDialog");
const subAgentsDialog = appRoot.querySelector("#subAgentsDialog");
const subAgentsDialogDescription = appRoot.querySelector("#subAgentsDialogDescription");
const subAgentEditor = appRoot.querySelector("#subAgentEditor");
const subAgentNameInput = appRoot.querySelector("#subAgentNameInput");
const subAgentUrlInput = appRoot.querySelector("#subAgentUrlInput");
const subAgentsList = appRoot.querySelector("#subAgentsList");
const subAgentsStatus = appRoot.querySelector("#subAgentsStatus");
const showAddSubAgentButton = appRoot.querySelector("#showAddSubAgentButton");
const saveSubAgentsButton = appRoot.querySelector("#saveSubAgentsButton");
const mcpDialog = appRoot.querySelector("#mcpDialog");
const toolPermissionsStatus = appRoot.querySelector("#toolPermissionsStatus");
const toolTypeSelect = appRoot.querySelector("#toolTypeSelect");
const toolLabelInput = appRoot.querySelector("#toolLabelInput");
const toolUrlInput = appRoot.querySelector("#toolUrlInput");
const toolHeadersInput = appRoot.querySelector("#toolHeadersInput");
const toolCommandInput = appRoot.querySelector("#toolCommandInput");
const toolArgsInput = appRoot.querySelector("#toolArgsInput");
const toolCwdInput = appRoot.querySelector("#toolCwdInput");
const addToolButton = appRoot.querySelector("#addToolButton");
const mcpTableToolbar = appRoot.querySelector("#mcpTableToolbar");
const mcpEditor = appRoot.querySelector("#mcpEditor");
const mcpEditorTitle = appRoot.querySelector("#mcpEditorTitle");
const reloadToolsButton = appRoot.querySelector("#reloadToolsButton");
const toolsList = appRoot.querySelector("#toolsList");
const toolsListPanel = appRoot.querySelector(".toolsListPanel");
const toolsStatus = appRoot.querySelector("#toolsStatus");
const providerSelect = appRoot.querySelector("#providerSelect");
const providerSettingsSection = appRoot.querySelector("#providerSettings");
const providerNameInput = appRoot.querySelector("#providerNameInput");
const providersTableBody = appRoot.querySelector("#providersTableBody");
const providerModelsTableBody = appRoot.querySelector("#providerModelsTableBody");
const modelsPage = appRoot.querySelector("models-page");
const providerModelsFilter = appRoot.querySelector("#providerModelsFilter");
let routeReady = false;
const refreshAllProviderModelsButton = appRoot.querySelector("#refreshAllProviderModelsButton");
const allProviderModelsStatus = appRoot.querySelector("#allProviderModelsStatus");
const providerModelsSortButtons = [...appRoot.querySelectorAll("[data-provider-model-sort]")];
const providerEditor = appRoot.querySelector("#providerEditor");
const saveSettingsButton = appRoot.querySelector("#saveSettingsButton");
const providerModelInput = appRoot.querySelector("#providerModelInput");
const providerBaseUrlInput = appRoot.querySelector("#providerBaseUrlInput");
const providerApiKeyInput = appRoot.querySelector("#providerApiKeyInput");
const providerApiKeyField = appRoot.querySelector("#providerApiKeyField");
const refreshModelsButton = appRoot.querySelector("#refreshModelsButton");
const providerModelsStatus = appRoot.querySelector("#providerModelsStatus");
const toolPermissionInputs = [...appRoot.querySelectorAll("[data-tool-permission]")];
const sidebarToggleButton = appRoot.querySelector("#sidebarToggleButton");
const sidebarResizeHandle = appRoot.querySelector("#sidebarResizeHandle");
const toggleFilesColumnButton = appRoot.querySelector("#toggleFilesColumnButton");
const presetStatusItems = appRoot.querySelector("#presetStatusItems");
const filesResizeHandle = appRoot.querySelector("#filesResizeHandle");
const workspaceTreeElement = appRoot.querySelector("#workspaceTree");
const filesWorkspaceLabel = appRoot.querySelector("#filesWorkspaceLabel");
const copyWorkspacePathButton = appRoot.querySelector("#copyWorkspacePathButton");
const selectWorkspaceRootButton = appRoot.querySelector("#selectWorkspaceRootButton");
const createWorkspaceButton = appRoot.querySelector("#createWorkspaceButton");
const createWorkspaceDialog = appRoot.querySelector("#createWorkspaceDialog");
const createWorkspaceParent = appRoot.querySelector("#createWorkspaceParent");
const createWorkspaceName = appRoot.querySelector("#createWorkspaceName");
const createWorkspaceStatus = appRoot.querySelector("#createWorkspaceStatus");
const confirmCreateWorkspaceButton = appRoot.querySelector("#confirmCreateWorkspaceButton");
const workspacePickerDialog = appRoot.querySelector("#workspacePickerDialog");
const workspacePickerTree = appRoot.querySelector("#workspacePickerTree");
const workspacePickerPath = appRoot.querySelector("#workspacePickerPath");
const workspacePickerTitle = appRoot.querySelector("#workspacePickerTitle");
const closeWorkspacePickerButton = appRoot.querySelector("#closeWorkspacePickerButton");
const cancelWorkspacePickerButton = appRoot.querySelector("#cancelWorkspacePickerButton");
const parentWorkspacePickerButton = appRoot.querySelector("#parentWorkspacePickerButton");
const confirmWorkspacePickerButton = appRoot.querySelector("#confirmWorkspacePickerButton");
const fileEditorDialog = appRoot.querySelector("#fileEditorDialog");
const fileEditorTitle = appRoot.querySelector("#fileEditorTitle");
const fileEditorPath = appRoot.querySelector("#fileEditorPath");
const fileEditorLanguage = appRoot.querySelector("#fileEditorLanguage");
const copyFilePreviewButton = appRoot.querySelector("#copyFilePreviewButton");
const fileEditorPreviewImage = appRoot.querySelector("#fileEditorPreviewImage");
const fileEditorPreviewHtml = appRoot.querySelector("#fileEditorPreviewHtml");
const fileEditorMarkdown = appRoot.querySelector("#fileEditorMarkdown");
const fileEditorPreviewText = appRoot.querySelector("#fileEditorPreviewText");
const fileEditorPreviewCode = appRoot.querySelector("#fileEditorPreviewCode");
const fileEditorStatus = appRoot.querySelector("#fileEditorStatus");

let socketService;
let runActive = false;
let stopRequested = false;
let creatingConversation = false;
let activeSessionId = null;
let pendingSessionId = null;
let promptHistoryIndex = null;
let promptHistoryDraft = "";
let streamingAnswer = null;
let attachedImages = [];
let microphoneState = "idle";
let microphoneRecorder = null;
let microphoneStream = null;
let defaultWorkspace = ".";
let workspaceBrowserRoot = null;
let workspaceBrowserNodes = [];
let workspaceRefreshTimer = null;
let workspaceTreeLoadId = 0;
let workspaceUploadActive = false;
let pendingWorkspacePath = null;
let workspacePickerRoot = null;
let workspacePickerParent = null;
let pendingWorkspaceParent = null;
let selectingDefaultWorkspace = false;
let openProvidersAfterWorkspaceSelection = false;
let previewingFilePath = null;
let filePreviewClipboardValue = null;
let filePreviewStatusTimer = null;
let workspacePathCopyStatusTimer = null;
let editingMcpBlock = null;

function setFilePreviewClipboardValue(value, label = "source") {
  filePreviewClipboardValue = value == null ? null : String(value);
  copyFilePreviewButton.disabled = filePreviewClipboardValue == null;
  const description = label === "image URL" ? "Copy image URL to clipboard" : "Copy source to clipboard";
  copyFilePreviewButton.title = description;
  copyFilePreviewButton.setAttribute("aria-label", description);
}

function updateFileEditorPreview(workspace, filePath, content, { copyable = true } = {}) {
  fileEditorPreviewImage.hidden = true;
  fileEditorPreviewImage.removeAttribute("src");
  fileEditorPreviewHtml.hidden = true;
  fileEditorPreviewHtml.removeAttribute("srcdoc");
  setFilePreviewClipboardValue(copyable ? content : null);
  if (/\.html?$/i.test(filePath)) {
    fileEditorPreviewText.hidden = true;
    fileEditorMarkdown.hidden = true;
    fileEditorMarkdown.replaceChildren();
    fileEditorPreviewHtml.hidden = false;
    fileEditorPreviewHtml.srcdoc = content;
    fileEditorLanguage.textContent = "HTML";
    return;
  }
  if (/\.md$/i.test(filePath)) {
    fileEditorPreviewText.hidden = true;
    fileEditorMarkdown.hidden = false;
    fileEditorMarkdown.replaceChildren();
    appendMarkdown(fileEditorMarkdown, content, {
      resolveLink: (href) => resolveWorkspaceMarkdownLink(workspace, href, filePath),
    });
    fileEditorLanguage.textContent = "Markdown";
    return;
  }
  fileEditorMarkdown.hidden = true;
  fileEditorMarkdown.replaceChildren();
  fileEditorPreviewText.hidden = false;
  const language = renderFilePreview(fileEditorPreviewCode, content, { filePath });
  fileEditorLanguage.textContent = codeLanguageLabel(language || "plaintext");
}

function updateImagePreview(workspace, node) {
  const assetUrl = workspaceFileAssetUrl(workspace, node.path);
  fileEditorPreviewCode.replaceChildren();
  fileEditorPreviewHtml.hidden = true;
  fileEditorPreviewHtml.removeAttribute("srcdoc");
  fileEditorMarkdown.replaceChildren();
  fileEditorMarkdown.hidden = true;
  fileEditorPreviewText.hidden = true;
  fileEditorPreviewImage.hidden = false;
  fileEditorPreviewImage.alt = `Preview of ${node.name}`;
  fileEditorLanguage.textContent = "Image";
  setFilePreviewClipboardValue(new URL(assetUrl, window.location.href).href, "image URL");
  return new Promise((resolve, reject) => {
    fileEditorPreviewImage.addEventListener("load", resolve, { once: true });
    fileEditorPreviewImage.addEventListener("error", () => reject(new Error("Unable to load image preview.")), { once: true });
    fileEditorPreviewImage.src = assetUrl;
  });
}

const MIN_SIDEBAR_WIDTH = 220;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ACTIVE_SESSION_STORAGE_KEY = "ai-harness.activeSessionId";
const SIDEBAR_COLLAPSED_STORAGE_KEY = "ai-harness.sidebarCollapsed";
const SIDEBAR_WIDTH_STORAGE_KEY = "ai-harness.sidebarWidth";
const FILES_WIDTH_STORAGE_KEY = "ai-harness.filesWidth";
const FILES_VISIBLE_STORAGE_KEY = "ai-harness.filesVisible";

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
  const active = presetConfigurations.find((configuration) => configuration.id === activePresetId);
  updateActivePresetSnapshot({
    systemPrompts: {
      ...(active?.systemPrompts || {}),
      [editingSystemPromptKey]: systemPromptContent.value,
    },
  });
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
  if (skill) {
    skillEditorContent.focus();
    skillEditorContent.setSelectionRange(0, 0);
    skillEditorContent.scrollTop = 0;
  } else {
    skillEditorName.focus();
  }
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
    renderPresetStatusBar();
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
  updateActivePresetSnapshot({ skillIds: selectedSkillIds });
  send({ type: "reload_skills" });
  skillsStatus.textContent = `${selectedSkillIds.length} skill${selectedSkillIds.length === 1 ? "" : "s"} selected`;
  skillsStatus.dataset.state = "success";
}

let sessions = [];
let providerSettings = defaultProviderSettings();
let providers = [];
let editingProviderId = null;
let editingProviderModels = [];
let editingProviderModelsLoadedAt = null;
let allProviderModelsLoadId = 0;
let providerModelsQuery = "";
let providerModelsProviderId = "";
let providerModelsSort = { key: "model", direction: "asc" };
const testingProviderModels = new Set();
let taskRatings = [];
let storedToolPermissions = normalizeToolPermissions();
let presetConfigurations = [];
let activePresetId = null;
let editingPresetId = null;
let editingPresetProviderSettings = null;
let editingPresetSkillIds = new Set();
let editingPresetMcpConfig = "";
let presetMutationPending = false;
let subAgentDrafts = [];
let sidebarWidth = 344;
let filesWidth = 300;
let promptCommandRequestId = 0;
const promptModelCache = new Map();
const persistUiState = createStateSaveQueue(
  saveUiState,
  (error) => addEvent("UI state save failed", error.message, { persist: false }),
);

function normalizeProviderRecords(value) {
  return (Array.isArray(value) ? value : []).map((provider) => ({
    ...provider,
    models: normalizeProviderModels(provider.models),
    modelsLoadedAt: Number(provider.modelsLoadedAt) || null,
  }));
}

const PRESET_STATUS_TOOL_LABELS = {
  list_files: "List files",
  read_file: "Read files",
  write_file: "Write files",
  search_files: "Search files",
  curl: "Curl",
  run_command: "Run commands",
  chrome_devtools: "Chrome DevTools",
  delegate_to_sub_agent: "Sub-agent delegation",
};

const PRESET_STATUS_WORKFLOW_LABELS = {
  composer: "Composer",
  tools: "Tools",
  mcp: "MCP",
  validation: "Validation",
};

function titleCaseIdentifier(value = "") {
  return String(value)
    .replaceAll(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function appendPresetStatusItem(label, values, compactValue = null, openSettings) {
  const normalizedValues = Array.isArray(values) ? values.filter(Boolean) : [values].filter(Boolean);
  const value = normalizedValues.length > 0 ? normalizedValues.join(", ") : "None";
  const item = document.createElement("button");
  item.type = "button";
  item.className = "presetStatusItem";
  item.title = `Open ${label.toLocaleLowerCase()} settings · ${value}`;
  item.setAttribute("aria-label", `Open ${label} settings. Current selection: ${value}`);
  item.addEventListener("click", () => openSettings());

  const labelElement = document.createElement("span");
  labelElement.className = "presetStatusLabel";
  labelElement.textContent = label;
  const valueElement = document.createElement("span");
  valueElement.className = "presetStatusValue";
  valueElement.textContent = compactValue ?? value;
  const icon = {
    "Sys prompts": "file-text", Skills: "star", Tools: "wrench",
    "Sub-agents": "people", MCP: "database", Workflow: "diagram-3", Preset: "sliders",
  }[label];
  item.append(bootstrapIcon(icon), labelElement, valueElement);
  presetStatusItems.append(item);
}

function renderPresetStatusBar() {
  presetStatusItems.replaceChildren();
  const active = presetConfigurations.find((configuration) => configuration.id === activePresetId);
  appendPresetStatusItem("Preset", active?.name || "Default", null, openPresetsModal);
  if (!active) {
    appendPresetStatusItem("Sys prompts", [], "0", openSystemPromptsModal);
    appendPresetStatusItem("Skills", [], "0", openSkillsModal);
    appendPresetStatusItem("Tools", [], "0", openToolsModal);
    appendPresetStatusItem("MCP", [], "None", openMcpModal);
    appendPresetStatusItem("Workflow", [], "0/4", openWorkflowSettings);
    return;
  }

  const activeSkillIds = new Set((active.skillIds || []).map((id) => String(id)));
  const configuredPrompts = Object.entries(active.systemPrompts || {})
    .filter(([, content]) => String(content || "").trim())
    .map(([name]) => PRESET_PROMPT_TITLES[name] || titleCaseIdentifier(name));
  const selectedSkills = skills
    .filter((skill) => skill.selected === true || activeSkillIds.has(String(skill.id)))
    .map((skill) => skill.name);
  const toolPermissions = normalizeToolPermissions(active.toolPermissions || storedToolPermissions);
  const selectedTools = Object.entries(toolPermissions)
    .filter(([, selected]) => selected === true)
    .map(([name]) => PRESET_STATUS_TOOL_LABELS[name] || titleCaseIdentifier(name));
  const selectedMcp = mcpBlocks(active.mcpConfig || toolsConfigContent)
    .filter((block) => block.enabled)
    .map((block) => block.label);
  const component = normalizeRigComponentState(active.componentState);
  const selectedWorkflowItems = Object.entries(component.effects)
    .filter(([, selected]) => selected !== false)
    .map(([name]) => PRESET_STATUS_WORKFLOW_LABELS[name] || titleCaseIdentifier(name));

  const skillStatus = selectedSkills.length > 0 ? selectedSkills : activeSkillIds.size > 0 ? `${activeSkillIds.size} selected` : [];
  appendPresetStatusItem("Sys prompts", configuredPrompts, String(configuredPrompts.length), openSystemPromptsModal);
  appendPresetStatusItem("Skills", skillStatus, String(selectedSkills.length || activeSkillIds.size), openSkillsModal);
  appendPresetStatusItem("Tools", selectedTools, String(selectedTools.length), openToolsModal);
  appendPresetStatusItem("MCP", selectedMcp, selectedMcp.length > 0 ? String(selectedMcp.length) : "None", openMcpModal);
  appendPresetStatusItem("Workflow", selectedWorkflowItems, `${selectedWorkflowItems.length}/4`, openWorkflowSettings);
}

function updateActivePresetSnapshot(patch) {
  const index = presetConfigurations.findIndex((configuration) => configuration.id === activePresetId);
  if (index < 0) return;
  presetConfigurations[index] = { ...presetConfigurations[index], ...patch };
  renderPresetStatusBar();
}

function setPresetsStatus(message, state = "") {
  presetsStatus.textContent = message;
  presetsStatus.dataset.state = state;
}

function presetMeta(configuration) {
  const settings = configuration.providerSettings || {};
  const provider = settings.provider || "openai";
  const model = settings.model || "default model";
  const toolCount = Object.values(configuration.toolPermissions || {}).filter(Boolean).length;
  const skillCount = Array.isArray(configuration.skillIds) ? configuration.skillIds.length : 0;
  return `${provider} · ${model} · ${toolCount} tools · ${skillCount} skills`;
}

function renderPresetProviderOptions(settings = {}) {
  const snapshot = providerSettingsFromRecord(settings);
  const matchedId = matchingProviderId(providers, snapshot);
  presetEditorProvider.replaceChildren();

  if (!matchedId) {
    const snapshotOption = document.createElement("option");
    snapshotOption.value = "__preset_snapshot__";
    snapshotOption.textContent = `Current preset · ${snapshot.provider} · ${snapshot.model}`;
    presetEditorProvider.append(snapshotOption);
  }

  for (const provider of providers) {
    const option = document.createElement("option");
    option.value = String(provider.id);
    option.textContent = `${provider.name} · ${provider.type} · ${provider.model || "default model"}`;
    presetEditorProvider.append(option);
  }

  presetEditorProvider.value = matchedId || "__preset_snapshot__";
  const matchedProvider = providers.find((provider) => String(provider.id) === matchedId);
  editingPresetProviderSettings = matchedProvider
    ? providerSettingsFromRecord(matchedProvider)
    : snapshot;
}

function selectPresetProvider() {
  const selected = providers.find((provider) => String(provider.id) === presetEditorProvider.value);
  if (selected) editingPresetProviderSettings = providerSettingsFromRecord(selected);
}

const PRESET_TOOL_INPUTS = {
  list_files: "presetToolListFiles",
  read_file: "presetToolReadFile",
  edit_files: "presetToolEditFiles",
  change_history: "presetToolChangeHistory",
  javascript: "presetToolJavaScript",
  write_file: "presetToolWriteFile",
  search_files: "presetToolSearchFiles",
  curl: "presetToolCurl",
  run_command: "presetToolRunCommand",
  chrome_devtools: "presetToolChromeDevTools",
  delegate_to_sub_agent: "presetToolDelegateToSubAgent",
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

function renderPresetSkills() {
  presetSkillsList.replaceChildren();
  if (skills.length === 0) {
    const empty = document.createElement("p");
    empty.className = "presetSkillsEmpty";
    empty.textContent = "No skills have been created yet.";
    presetSkillsList.append(empty);
    return;
  }
  const query = presetSkillsSearch.value.trim().toLocaleLowerCase();
  const visibleSkills = query
    ? skills.filter((skill) => [skill.name, summarizeSkillContent(skill.content)]
      .some((value) => String(value || "").toLocaleLowerCase().includes(query)))
    : skills;
  if (visibleSkills.length === 0) {
    const empty = document.createElement("p");
    empty.className = "presetSkillsEmpty";
    empty.textContent = `No skills match “${presetSkillsSearch.value.trim()}”.`;
    presetSkillsList.append(empty);
    return;
  }
  for (const skill of visibleSkills) {
    const label = document.createElement("label");
    label.className = "presetToggle";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = editingPresetSkillIds.has(String(skill.id));
    checkbox.dataset.skillId = skill.id;
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) editingPresetSkillIds.add(String(skill.id));
      else editingPresetSkillIds.delete(String(skill.id));
    });
    const identity = document.createElement("span");
    const name = document.createElement("strong");
    name.textContent = skill.name;
    const summary = document.createElement("small");
    summary.textContent = summarizeSkillContent(skill.content);
    identity.append(name, summary);
    label.append(checkbox, identity);
    presetSkillsList.append(label);
  }
}

function setPresetMcpStatus(message, state = "") {
  presetMcpStatus.textContent = message;
  presetMcpStatus.dataset.state = state;
}

function renderPresetMcpTypeFields() {
  const remote = presetMcpType.value === "remote";
  presetMcpUrlField.hidden = !remote;
  presetMcpHeadersField.hidden = !remote;
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
    let headers;
    try {
      headers = httpHeadersToml(presetMcpHeaders.value);
    } catch (error) {
      setPresetMcpStatus(error.message, "error");
      presetMcpHeaders.focus();
      return;
    }
    snippet = `[[mcp.servers]]\nserver_label = "${quoteToml(label)}"\nserver_url = "${quoteToml(url)}"\nrequire_approval = "never"${headers ? `\n\n${headers}` : ""}`;
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
  presetMcpHeaders.value = "";
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
  const permissions = normalizeToolPermissions(configuration.toolPermissions);
  editingPresetId = configuration.id;
  presetEditorName.value = configuration.name;
  renderPresetProviderOptions(provider);
  for (const [key, id] of Object.entries(PRESET_TOOL_INPUTS)) {
    appRoot.querySelector(`#${id}`).checked = permissions[key] === true;
  }
  editingPresetSkillIds = new Set((configuration.skillIds || []).map((id) => String(id)));
  presetSkillsSearch.value = "";
  renderPresetSkills();
  renderPresetPromptEditors(configuration.systemPrompts || {});
  editingPresetMcpConfig = configuration.mcpConfig || "";
  presetMcpType.value = "remote";
  presetMcpHeaders.value = "";
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
  editingPresetProviderSettings = null;
  editingPresetSkillIds = new Set();
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
  const componentState = normalizeRigComponentState(current.componentState);
  const toolPermissions = normalizeToolPermissions(
    Object.fromEntries(Object.entries(PRESET_TOOL_INPUTS).map(([key, id]) => [key, appRoot.querySelector(`#${id}`).checked])),
  );
  const skillIds = [...editingPresetSkillIds];
  const updated = {
    ...current,
    name: presetEditorName.value.trim() || `Preset ${index + 1}`,
    providerSettings: providerSettingsFromRecord(editingPresetProviderSettings),
    componentState,
    toolPermissions,
    skillIds,
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

async function loadPresetSummary() {
  const skillsPromise = fetchSkills().catch(() => null);
  try {
    const result = await fetchRigConfigurations();
    presetConfigurations = Array.isArray(result.configurations) ? result.configurations : [];
    activePresetId = result.activeConfigurationId
      || presetConfigurations.find((configuration) => configuration.selected)?.id
      || null;
  } catch {
    presetConfigurations = [];
    activePresetId = null;
  }
  const storedSkills = await skillsPromise;
  if (Array.isArray(storedSkills)) skills = storedSkills;
  renderPresetStatusBar();
}

async function syncPresetRuntimeState() {
  const [state, config, storedSkills] = await Promise.all([loadUiState(), fetchConfig(), fetchSkills()]);
  providerSettings = { ...defaultProviderSettings(), ...(state.providerSettings || {}) };
  providers = normalizeProviderRecords(state.providers);
  editingProviderId = providers.find((provider) => provider.selected)?.id || null;
  storedToolPermissions = normalizeToolPermissions(state.toolPermissions);
  toolsConfigContent = config.content || "";
  skills = storedSkills;
  systemPrompts = [];
  renderProviderSettings(providerSettings);
  renderProvidersTable();
  renderToolPermissions();
  renderTools();
  applyActiveProviderSettings(providerSettings);
  send({ type: "tool_permissions", permissions: storedToolPermissions });
  send({ type: "reload_tools" });
  send({ type: "reload_skills" });
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
    renderPresetStatusBar();
  }
}

async function loadPresets() {
  closePresetEditor();
  createPresetButton.disabled = true;
  setPresetsStatus("Loading presets...");
  try {
    const [result, storedSkills] = await Promise.all([fetchRigConfigurations(), fetchSkills()]);
    skills = storedSkills;
    presetConfigurations = Array.isArray(result.configurations) ? result.configurations : [];
    activePresetId = result.activeConfigurationId || presetConfigurations.find((configuration) => configuration.selected)?.id || null;
    setPresetsStatus("Presets are shared with the workflow interface.");
  } catch (error) {
    presetConfigurations = [];
    activePresetId = null;
    setPresetsStatus(error.message, "error");
  }
  renderPresets();
  renderPresetStatusBar();
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
    id: randomUuid(),
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
  localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(collapsed));
  applySidebarState(collapsed);
}

function applyFilesColumnState(visible) {
  appShell.classList.toggle("files-collapsed", !visible);
  toggleFilesColumnButton.setAttribute("aria-pressed", String(visible));
  toggleFilesColumnButton.title = `${visible ? "Hide" : "Show"} workspace column`;
  toggleFilesColumnButton.setAttribute("aria-label", toggleFilesColumnButton.title);
}

function toggleFilesColumn() {
  const visible = appShell.classList.contains("files-collapsed");
  localStorage.setItem(FILES_VISIBLE_STORAGE_KEY, String(visible));
  applyFilesColumnState(visible);
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
  localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, "false");
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
    setFilesWidth(window.innerWidth - moveEvent.clientX - 4);
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
  fileEditorStatus.textContent = "Loading…";
  window.clearTimeout(filePreviewStatusTimer);
  setFilePreviewClipboardValue(null);
  fileEditorDialog.showModal();
  try {
    if (isWorkspaceImagePath(node.path)) {
      await updateImagePreview(workspace, node);
    } else {
      updateFileEditorPreview(workspace, node.path, "", { copyable: false });
      const content = await loadWorkspaceFile(workspace, node.path);
      if (previewingFilePath !== node.path || !fileEditorDialog.open) return;
      updateFileEditorPreview(workspace, node.path, content);
    }
    if (previewingFilePath !== node.path || !fileEditorDialog.open) return;
    fileEditorStatus.textContent = "";
  } catch (error) {
    if (previewingFilePath !== node.path || !fileEditorDialog.open) return;
    fileEditorStatus.textContent = error.message;
  }
}

async function copyFilePreviewSource() {
  if (filePreviewClipboardValue == null) return;
  window.clearTimeout(filePreviewStatusTimer);
  try {
    await copyTextToClipboard(filePreviewClipboardValue);
    fileEditorStatus.textContent = "Copied to clipboard.";
    filePreviewStatusTimer = window.setTimeout(() => {
      if (fileEditorDialog.open) fileEditorStatus.textContent = "";
    }, 1800);
  } catch (error) {
    fileEditorStatus.textContent = error.message;
  }
}

async function copyWorkspacePath() {
  const path = filesWorkspaceLabel.textContent.trim();
  if (!path || copyWorkspacePathButton.disabled) return;
  window.clearTimeout(workspacePathCopyStatusTimer);
  try {
    await copyTextToClipboard(path);
    copyWorkspacePathButton.classList.add("is-copied");
    copyWorkspacePathButton.title = "Copied workspace path";
    copyWorkspacePathButton.setAttribute("aria-label", "Copied workspace path");
    workspacePathCopyStatusTimer = window.setTimeout(() => {
      copyWorkspacePathButton.classList.remove("is-copied");
      copyWorkspacePathButton.title = "Copy workspace path";
      copyWorkspacePathButton.setAttribute("aria-label", "Copy workspace path");
    }, 1800);
  } catch (error) {
    addEvent("Workspace path copy failed", error.message, { persist: false });
  }
}

async function loadWorkspaceTree() {
  const loadId = ++workspaceTreeLoadId;
  const selectedWorkspace = activeSession()?.workspace || defaultWorkspace;
  filesWorkspaceLabel.textContent = selectedWorkspace;
  copyWorkspacePathButton.disabled = false;
  workspaceTreeElement.innerHTML = '<p class="workspaceTreeStatus">Loading files…</p>';
  selectWorkspaceRootButton.disabled = true;
  try {
    const payload = await fetchWorkspaceTree(selectedWorkspace);
    if (loadId !== workspaceTreeLoadId || selectedWorkspace !== (activeSession()?.workspace || defaultWorkspace)) return;
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
    if (loadId !== workspaceTreeLoadId) return;
    workspaceBrowserRoot = null;
    workspaceBrowserNodes = [];
    workspaceTreeElement.innerHTML = "";
    const status = document.createElement("p"); status.className = "workspaceTreeStatus"; status.textContent = error.message;
    workspaceTreeElement.append(status);
  }
}

function scheduleWorkspaceTreeRefresh(delay = 140) {
  window.clearTimeout(workspaceRefreshTimer);
  workspaceRefreshTimer = window.setTimeout(() => {
    workspaceRefreshTimer = null;
    loadWorkspaceTree();
  }, delay);
}

async function uploadDroppedWorkspaceFiles(files = []) {
  if (workspaceUploadActive || files.length === 0) return;
  workspaceUploadActive = true;
  const workspace = activeSession()?.workspace || defaultWorkspace;
  const failures = [];
  let uploaded = 0;
  try {
    for (const [index, file] of files.entries()) {
      workspaceComponent.setUploadStatus(`Uploading ${index + 1} of ${files.length}: ${file.name}`, "uploading");
      try {
        await uploadWorkspaceFile(workspace, file);
        uploaded += 1;
      } catch (error) {
        failures.push(`${file.name}: ${error.message}`);
      }
    }
    scheduleWorkspaceTreeRefresh(0);
    if (failures.length === 0) {
      const label = `${uploaded} file${uploaded === 1 ? "" : "s"} uploaded`;
      workspaceComponent.setUploadStatus(label, "success");
      addEvent("Workspace files uploaded", label);
    } else {
      const message = `${uploaded} uploaded · ${failures.length} failed`;
      workspaceComponent.setUploadStatus(message, "error");
      addEvent("Workspace upload failed", failures.join("\n"));
    }
  } finally {
    workspaceUploadActive = false;
    window.setTimeout(() => {
      if (!workspaceUploadActive) workspaceComponent.setUploadStatus();
    }, 2400);
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

function setWorkspacePickerMode({ chooseDefault = false } = {}) {
  selectingDefaultWorkspace = chooseDefault;
  workspacePickerTitle.textContent = chooseDefault ? "Choose default workspace" : "Select workspace folder";
  closeWorkspacePickerButton.hidden = chooseDefault;
  cancelWorkspacePickerButton.hidden = chooseDefault;
  confirmWorkspacePickerButton.disabled = false;
  confirmWorkspacePickerButton.textContent = chooseDefault ? "Set default workspace" : "Select folder";
}

async function openWorkspacePicker() {
  if (!workspaceBrowserRoot) return;
  setWorkspacePickerMode();
  workspacePickerDialog.showModal();
  try { await loadWorkspacePickerRoot(workspaceBrowserRoot); } catch (error) { workspacePickerPath.textContent = error.message; }
}

async function openDefaultWorkspacePicker() {
  setWorkspacePickerMode({ chooseDefault: true });
  workspacePickerDialog.showModal();
  try {
    await loadWorkspacePickerRoot(workspaceBrowserRoot || defaultWorkspace);
  } catch (error) {
    workspacePickerPath.textContent = error.message;
  }
}

async function selectWorkspace(path) {
  const isDefaultSelection = selectingDefaultWorkspace;
  if (isDefaultSelection) {
    confirmWorkspacePickerButton.disabled = true;
    workspacePickerPath.textContent = "Creating conversation workspaces…";
    try {
      await provisionConversationWorkspaces(path);
      defaultWorkspace = saveDefaultWorkspace(path);
    } catch (error) {
      workspacePickerPath.textContent = error.message;
      confirmWorkspacePickerButton.disabled = false;
      return;
    }
  }
  workspaceInput.value = isDefaultSelection ? activeSession()?.workspace || path : path;
  selectingDefaultWorkspace = false;
  if (workspacePickerDialog.open) workspacePickerDialog.close();
  setWorkspacePickerMode();
  if (!isDefaultSelection) saveActiveWorkspace();
  if (isDefaultSelection) {
    renderWorkspace();
    loadWorkspaceTree();
    addEvent("Default workspace selected", path);
  }
  if (openProvidersAfterWorkspaceSelection) {
    openProvidersAfterWorkspaceSelection = false;
    openProvidersModal();
  }
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
    createWorkspaceDialog.close();
    await selectWorkspace(result.path);
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

function applyConversationWorkspace(session, result) {
  const changed = session.workspace !== result.path
    || session.managedWorkspaceRoot !== result.root
    || session.managedWorkspaceName !== result.name;
  session.workspace = result.path;
  session.managedWorkspaceRoot = result.root;
  session.managedWorkspaceName = result.name;
  if (changed) session.updatedAt = Date.now();
  return changed;
}

async function createManagedSession(title, root = defaultWorkspace) {
  const session = createSession(title, root);
  const result = await createConversationWorkspace(root, session.id);
  applyConversationWorkspace(session, result);
  return session;
}

async function provisionConversationWorkspaces(root = defaultWorkspace) {
  const provisioned = await Promise.all(sessions.map(async (session) => ({
    session,
    result: await createConversationWorkspace(
      session.managedWorkspaceRoot || root,
      session.id,
      session.managedWorkspaceName,
    ),
  })));
  let changed = false;
  for (const { session, result } of provisioned) {
    changed = applyConversationWorkspace(session, result) || changed;
  }
  if (changed) await saveSessions();
}

async function removeConversationWorkspace(session) {
  if (!session?.managedWorkspaceRoot) return;
  await deleteConversationWorkspace(session.managedWorkspaceRoot, session.id, session.managedWorkspaceName);
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

function setMicrophoneState(state) {
  const labels = {
    idle: "Start voice input",
    requesting: "Requesting microphone access…",
    recording: "Stop voice input",
    transcribing: "Transcribing voice input…",
  };
  microphoneState = state;
  microphoneButton.dataset.state = state;
  microphoneButton.title = labels[state];
  microphoneButton.setAttribute("aria-label", labels[state]);
  microphoneButton.setAttribute("aria-pressed", String(state === "recording"));
  microphoneButton.disabled = runActive || state === "requesting" || state === "transcribing";
  renderSendButton();
}

function releaseMicrophone() {
  microphoneStream?.getTracks().forEach((track) => track.stop());
  microphoneStream = null;
}

function preferredMicrophoneMimeType() {
  if (typeof MediaRecorder?.isTypeSupported !== "function") return "";
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]
    .find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

async function transcribeMicrophoneBlob(recording, workspace) {
  const dataUrl = await readFileAsDataUrl(recording);
  const separator = dataUrl.indexOf(",");
  if (separator < 0) throw new Error("Unable to read the microphone recording.");
  const saved = await saveWorkspaceRecording(workspace, recording.type, dataUrl.slice(separator + 1));
  const result = await transcribeWorkspaceRecording(workspace, saved.relativePath);
  const current = promptInput.value.trimEnd();
  setPromptInput(current ? `${current} ${result.text}` : result.text);
  resetPromptHistoryCursor();
  addEvent("Voice input transcribed", { model: result.model, recording: saved.relativePath });
  loadWorkspaceTree();
}

async function startMicrophoneRecording() {
  if (runActive || microphoneState !== "idle") return;
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    addEvent("Microphone unavailable", "This browser does not support audio recording.", { persist: false });
    return;
  }

  setMicrophoneState("requesting");
  try {
    const workspace = activeSession()?.workspace || defaultWorkspace;
    microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = preferredMicrophoneMimeType();
    const recorder = mimeType
      ? new MediaRecorder(microphoneStream, { mimeType })
      : new MediaRecorder(microphoneStream);
    const chunks = [];
    let recorderError = null;
    microphoneRecorder = recorder;
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    });
    recorder.addEventListener("error", (event) => {
      recorderError = event.error || new Error("Microphone recording failed.");
    });
    recorder.addEventListener("stop", async () => {
      releaseMicrophone();
      if (microphoneRecorder === recorder) microphoneRecorder = null;
      setMicrophoneState("transcribing");
      try {
        if (recorderError) throw recorderError;
        const recording = new Blob(chunks, { type: recorder.mimeType || mimeType });
        if (!recording.size) throw new Error("The microphone recording is empty.");
        await transcribeMicrophoneBlob(recording, workspace);
      } catch (error) {
        addEvent("Voice input failed", error.message, { persist: false });
      } finally {
        setMicrophoneState("idle");
        promptInput.focus();
      }
    }, { once: true });
    recorder.start();
    setMicrophoneState("recording");
  } catch (error) {
    microphoneRecorder = null;
    releaseMicrophone();
    setMicrophoneState("idle");
    addEvent("Microphone unavailable", error.message, { persist: false });
  }
}

function toggleMicrophone() {
  if (microphoneState === "recording" && microphoneRecorder?.state === "recording") {
    setMicrophoneState("transcribing");
    microphoneRecorder.stop();
    return;
  }
  startMicrophoneRecording();
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

function renderSendButton() {
  sendButton.type = runActive ? "button" : "submit";
  const label = runActive ? (stopRequested ? "Stopping…" : "Stop") : "Send";
  sendButton.setAttribute("aria-label", label);
  sendButton.title = label;
  sendButton.disabled = !socketService?.isOpen || stopRequested || (!runActive && microphoneState !== "idle");
  sendButton.replaceChildren(bootstrapIcon(runActive ? "stop-fill" : "arrow-up"));
}

function setBusy(value) {
  runActive = value;
  if (!value) stopRequested = false;
  renderSendButton();
  microphoneButton.disabled = value || microphoneState === "requesting" || microphoneState === "transcribing";
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
  return article;
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
  const anchors = activityMessageIndices(session.messages, activities);
  const appendActivity = (activity, index) => messages.append(createSessionActivityCard(activity, {
    active: index === activities.length - 1 && runActive, sessionId: session.id,
  }));
  session.messages.forEach((message, messageIndex) => {
    const article = renderMessage(message.role, message.text, message.images || [], session.workspace || defaultWorkspace);
    article.dataset.messageIndex = String(messageIndex);
    activities.forEach((activity, index) => {
      if (anchors[index] === messageIndex) appendActivity(activity, index);
    });
  });
  activities.forEach((activity, index) => {
    if (anchors[index] < 0) appendActivity(activity, index);
  });
}

function createSessionActivityCard(activity, { active = false, sessionId = activeSessionId } = {}) {
  const card = document.createElement("details");
  card.className = "sessionActivity";
  card.dataset.sessionId = sessionId;
  card.setAttribute("aria-label", "Session step summary");
  card.setAttribute("aria-live", "polite");
  const summary = document.createElement("summary");
  const visualization = createStepVisualization();
  const eyebrow = document.createElement("span");
  eyebrow.className = "sessionActivityEyebrow";
  const current = document.createElement("strong");
  current.className = "currentSessionStep";
  const count = document.createElement("span");
  count.className = "sessionTaskCount";
  const rating = document.createElement("span");
  rating.className = "sessionRating";
  rating.setAttribute("role", "group");
  rating.setAttribute("aria-label", "Rate this completed task");
  for (let value = 1; value <= 5; value += 1) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.rating = String(value);
    button.append(bootstrapIcon("star-fill"));
    button.setAttribute("aria-label", `Rate this task ${value} out of 5`);
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await rateSessionActivity(card, value);
    });
    rating.append(button);
  }
  const chevron = document.createElement("span");
  chevron.className = "sessionActivityChevron";
  chevron.append(bootstrapIcon("chevron-right"));
  chevron.setAttribute("aria-hidden", "true");
  summary.append(visualization, eyebrow, current, count, rating, chevron);
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

function createStepDetails(task) {
  const body = document.createElement("div");
  body.className = "sessionStepDetails";
  body.hidden = true;
  for (const section of task.details || []) {
    const article = document.createElement("section");
    const heading = document.createElement("h4");
    const headingLabel = document.createElement("span");
    headingLabel.textContent = section.title;
    if (section.meta) {
      const meta = document.createElement("span");
      meta.className = "sessionStepDetailMeta";
      meta.textContent = section.meta;
      heading.append(headingLabel, meta);
    } else {
      heading.append(headingLabel);
    }
    const text = document.createElement("pre");
    text.textContent = task.response !== undefined && section.title === "Response"
      ? formatCommandResponse(task.response)
      : section.text;
    article.append(heading, text);
    body.append(article);
  }
  return body;
}

function createStepDetailsButton(task, details, expanded = false) {
  const button = document.createElement("button");
  button.className = "sessionTaskExpand";
  button.type = "button";
  button.setAttribute("aria-label", `Show details for ${task.label}`);
  const setExpanded = (open) => {
    button.replaceChildren(bootstrapIcon(open ? "dash-lg" : "plus-lg"));
    button.setAttribute("aria-expanded", String(open));
    button.setAttribute("aria-label", `${open ? "Hide" : "Show"} details for ${task.label}`);
    details.hidden = !open;
    details.closest(".sessionTask")?.toggleAttribute("data-details-open", open);
  };
  button.addEventListener("click", () => setExpanded(button.getAttribute("aria-expanded") !== "true"));
  setExpanded(expanded);
  return button;
}

function updateSessionActivityCard(card, activity, { active = false } = {}) {
  card.activity = activity;
  const wasComplete = card.dataset.complete === "true";
  const isRunning = active && !activity.complete;
  const failed = activity.items.some((item) => item.status === "failed");
  const eyebrow = card.querySelector(".sessionActivityEyebrow");
  const visualization = card.querySelector(".stepVisualization");
  const current = card.querySelector(".currentSessionStep");
  const count = card.querySelector(".sessionTaskCount");
  const list = card.querySelector(".sessionTaskList");
  eyebrow.textContent = isRunning ? "Current step" : "Step summary";
  updateStepVisualization(visualization, activity, { active });
  current.textContent = isRunning ? activity.current?.label || "Working…" : failed ? "Run completed with errors" : activity.stopped ? "Run stopped" : "Run completed";
  current.dataset.state = isRunning ? "running" : failed ? "failed" : "idle";
  const taskCount = `${activity.items.length} task${activity.items.length === 1 ? "" : "s"}`;
  const runCost = calculateActivityRunCost(activity);
  count.textContent = activity.usage
    ? `${taskCount} · ${formatTokenCount(activity.usage.totalTokens)} tokens${runCost === null ? "" : ` · ${formatRunCost(runCost)}`}`
    : taskCount;
  count.title = activity.usage
    ? `${formatTokenCount(activity.usage.inputTokens)} input · ${formatTokenCount(activity.usage.outputTokens)} output · ${formatTokenCount(activity.usage.totalTokens)} total tokens${runCost === null ? "" : ` · ${formatRunCost(runCost)} estimated cost`}`
    : "";
  const ratingControl = card.querySelector(".sessionRating");
  const storedRating = taskRatings.find((entry) => entry.runId === taskRatingRunId(activity, card.dataset.sessionId));
  ratingControl.hidden = !activity.complete;
  for (const button of ratingControl.querySelectorAll("button")) {
    const selected = Number(button.dataset.rating) <= Number(storedRating?.rating || 0);
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-pressed", String(Number(button.dataset.rating) === Number(storedRating?.rating || 0)));
    button.disabled = ratingControl.dataset.pending === "true";
  }
  const expandedTaskDetails = new Set(
    [...list.querySelectorAll(".sessionTask[data-details-open]")].map((item) => item.dataset.taskId),
  );
  list.replaceChildren(...activity.items.map((task) => {
    const item = document.createElement("li");
    item.className = `sessionTask sessionTask-${task.status}`;
    item.dataset.taskId = task.id;
    const marker = document.createElement("span");
    marker.className = "sessionTaskMarker";
    marker.setAttribute("aria-hidden", "true");
    marker.append(bootstrapIcon(task.status === "running" ? "circle-fill" : task.status === "failed" ? "exclamation-lg" : task.status === "stopped" ? "stop-fill" : "check-lg"));
    const label = document.createElement("span");
    label.className = "sessionTaskLabel";
    label.textContent = task.label;
    const content = document.createElement("span");
    content.className = "sessionTaskContent";
    content.append(label);
    if (task.usage) {
      const tokens = document.createElement("span");
      tokens.className = "sessionTaskTokens";
      const contextLabel = task.contextUsage
        ? ` · ${formatContextPercentage(task.contextUsage.percentage)}`
        : "";
      tokens.textContent = `${formatTokenCount(task.usage.inputTokens)} input · ${formatTokenCount(task.usage.outputTokens)} output${contextLabel}`;
      tokens.title = task.contextUsage
        ? `${formatTokenCount(task.contextUsage.usedTokens)} of ${formatTokenCount(task.contextUsage.contextWindow)} context tokens used${task.contextUsage.model ? ` · ${task.contextUsage.model}` : ""}`
        : `${formatTokenCount(task.usage.totalTokens)} total tokens`;
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
    if (task.details?.length) {
      const details = createStepDetails(task);
      const expanded = expandedTaskDetails.has(task.id) || task.response?.ok === false;
      item.append(createStepDetailsButton(task, details, expanded), details);
      item.toggleAttribute("data-details-open", expanded);
    }
    return item;
  }));
  card.dataset.running = String(isRunning);
  card.dataset.complete = String(activity.complete);
  if (isRunning) card.open = true;
  else if (activity.complete && !wasComplete) card.open = false;
}

function taskRatingRunId(activity, sessionId) {
  return activity.runContext?.runId || `${sessionId}:${activity.runId}`;
}

async function rateSessionActivity(card, rating) {
  const activity = card.activity;
  const sessionId = card.dataset.sessionId;
  if (!activity?.complete || !sessionId) return;
  const control = card.querySelector(".sessionRating");
  control.dataset.pending = "true";
  control.querySelectorAll("button").forEach((button) => { button.disabled = true; });
  const context = activity.runContext || {};
  const modelUsed = [...activity.items].reverse().find((item) => item.modelTurn?.model)?.modelTurn.model
    || [...activity.items].reverse().find((item) => item.model)?.model
    || context.model;
  const provider = providers.find((entry) => String(entry.id) === String(context.providerId))
    || (() => {
      const matches = providers.filter((entry) => normalizeProviderModels([entry.model, ...(entry.models || [])])
        .some((model) => model.id === modelUsed));
      const typed = context.provider ? matches.filter((entry) => entry.type === context.provider) : matches;
      return typed.length === 1 ? typed[0] : null;
    })();
  const record = {
    runId: taskRatingRunId(activity, sessionId),
    sessionId,
    providerId: context.providerId || provider?.id || "",
    providerName: context.providerName || provider?.name || titleCaseIdentifier(context.provider || "Unknown provider"),
    model: modelUsed || "Unknown model",
    inputPrompt: context.inputPrompt
      || activity.items.find((item) => item.key === "prompt")?.details?.[0]?.text
      || "",
    presetSettings: context.presetSettings || {},
    tools: context.tools || {},
    systemPrompts: context.systemPrompts || {},
    cost: calculateActivityRunCost(activity),
    rating,
  };
  try {
    const saved = await persistTaskRating(record);
    taskRatings = [saved, ...taskRatings.filter((entry) => entry.runId !== saved.runId)];
    control.dataset.pending = "false";
    updateSessionActivityCard(card, activity, { active: false });
    renderProviderModelsTable();
  } catch (error) {
    control.title = error.message;
    control.dataset.pending = "false";
    control.querySelectorAll("button").forEach((button) => { button.disabled = false; });
  }
}

function calculateActivityRunCost(activity) {
  const usageItems = activity.items.filter((item) => item.usage);
  if (usageItems.length === 0) return null;
  let total = 0;
  for (const item of usageItems) {
    const modelName = item.model || activity.runContext?.model;
    const pricing = providerModelPricing(activity.runContext, modelName);
    const cost = calculateTokenCost(item.usage, pricing);
    if (cost === null) return null;
    total += cost;
  }
  return total;
}

function providerModelPricing(runContext, modelName) {
  if (runContext?.model === modelName
    && runContext.inputCost !== null && runContext.inputCost !== undefined
    && runContext.outputCost !== null && runContext.outputCost !== undefined) return runContext;
  const contextProvider = runContext?.providerId
    ? providers.find((provider) => String(provider.id) === runContext.providerId)
    : null;
  if (runContext?.providerId) {
    const model = normalizeProviderModels([contextProvider?.model, ...(contextProvider?.models || [])])
      .find((entry) => entry.id === modelName);
    if (model?.inputCost !== null && model?.inputCost !== undefined
      && model?.outputCost !== null && model?.outputCost !== undefined) return model;
    return runContext?.model === modelName ? runContext : null;
  }
  const modelPricing = (provider) => normalizeProviderModels([provider?.model, ...(provider?.models || [])])
    .find((entry) => entry.id === modelName
      && entry.inputCost !== null && entry.outputCost !== null);
  const matches = providers.map(modelPricing).filter(Boolean);
  const uniquePrices = new Set(matches.map((model) => `${model.inputCost}:${model.outputCost}`));
  if (matches.length > 0 && uniquePrices.size === 1) {
    return matches[0];
  }
  if (runContext?.model === modelName) return runContext;
  return null;
}

function formatRunCost(value) {
  if (value > 0 && value < 0.000001) return "<$0.000001";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(value);
}

function refreshRunningStepDurations() {
  messages.querySelectorAll('.sessionTaskDuration[data-running="true"]').forEach((duration) => {
    duration.textContent = formatStepDuration(Date.now() - Number(duration.dataset.startedAt));
  });
}

function renderSessionActivity() {
  const session = activeSession();
  const activities = sessionActivityRuns(session?.events || []);
  const anchors = activityMessageIndices(session?.messages || [], activities);
  const cards = [...messages.querySelectorAll(".sessionActivity")];
  const retained = new Set();
  const tails = new Map();
  activities.forEach((activity, index) => {
    let card = cards.find((candidate) => candidate.activity?.runId === activity.runId);
    const active = index === activities.length - 1 && runActive;
    if (!card) card = createSessionActivityCard(activity, { active, sessionId: activeSessionId });
    else if (index === activities.length - 1) updateSessionActivityCard(card, activity, { active });
    retained.add(card);
    const anchor = tails.get(anchors[index]) || messages.querySelector(`[data-message-index="${anchors[index]}"]`);
    if (anchor) anchor.insertAdjacentElement('afterend', card);
    else messages.append(card);
    tails.set(anchors[index], card);
  });
  cards.filter((card) => !retained.has(card)).forEach((card) => card.remove());
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
    const title = session.title || "New chat";
    button.title = title;
    button.setAttribute("aria-label", title);
    button.className = session.id === activeSessionId ? "active" : "";
    const icon = document.createElement("span");
    icon.className = "navIcon recentIcon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = Array.from(title.trim())[0]?.toLocaleUpperCase() || "N";
    const label = document.createElement("span");
    label.className = "navLabel";
    label.textContent = title;
    button.append(icon, label);
    button.addEventListener("click", () => {
      navigateRoute("/");
      if (runActive || microphoneState !== "idle" || session.id === activeSessionId) return;
      activeSessionId = session.id;
      localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, activeSessionId);
      renderRecents();
      renderMessages();
      renderSessionActivity();
      renderWorkspace();
      loadWorkspaceTree();
      addEvent("Opened recent chat", session.title);
    });
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "deleteConversationButton";
    deleteButton.title = `Delete ${session.title || "conversation"}`;
    deleteButton.setAttribute("aria-label", `Delete ${session.title || "conversation"}`);
    deleteButton.append(bootstrapIcon("x-lg"));
    deleteButton.addEventListener("click", async () => {
      if (microphoneState !== "idle" || (runActive && session.id === activeSessionId)) return;
      if (!window.confirm(`Delete conversation “${session.title || "New chat"}” and all files in its workspace? This cannot be undone.`)) return;
      deleteButton.disabled = true;
      let replacement = null;
      try {
        if (sessions.length === 1) replacement = await createManagedSession("AI Harness Session");
        try {
          await removeConversationWorkspace(session);
        } catch (error) {
          if (replacement) await removeConversationWorkspace(replacement).catch(() => {});
          throw error;
        }
        const deletingActive = session.id === activeSessionId;
        sessions = sessions.filter((candidate) => candidate.id !== session.id);
        if (replacement) sessions = [replacement];
        if (deletingActive) activeSessionId = sessions[0]?.id || null;
        if (activeSessionId) localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, activeSessionId);
        else localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
        await persistUiState({ sessions });
        send({ type: "reset", sessionId: session.id });
        renderRecents();
        renderMessages();
        renderSessionActivity();
        renderWorkspace();
        loadWorkspaceTree();
      } catch (error) {
        deleteButton.disabled = false;
        addEvent("Conversation deletion failed", error.message, { persist: false });
      }
    });
    row.append(button, deleteButton);
    recentsList.append(row);
  }
}

async function startNewChat() {
  navigateRoute("/");
  if (runActive || microphoneState !== "idle" || creatingConversation) return;
  creatingConversation = true;
  try {
    const session = await createManagedSession("New chat");
    sessions = [session, ...sessions];
    activeSessionId = session.id;
    localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, activeSessionId);
    await persistUiState({ sessions });
    renderRecents();
    renderMessages();
    renderWorkspace();
    renderSessionActivity();
    loadWorkspaceTree();
    addEvent("New chat started");
  } catch (error) {
    addEvent("Unable to create conversation", error.message, { persist: false });
  } finally {
    creatingConversation = false;
  }
}

function addEvent(title, detail, { persist = true } = {}) {
  const event = { title, detail, timestamp: Date.now() };
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

function promptCommandOption(id, label, description, selected, action = {}) {
  return {
    id: String(id),
    label,
    description,
    selected,
    toggle: ["skill", "tool", "mcp", "workflow"].includes(action.type),
    action,
  };
}

async function promptCommandOptions(command) {
  if (command === "model") {
    const key = JSON.stringify([providerSettings.provider, providerSettings.baseUrl, providerSettings.apiKey]);
    let models = promptModelCache.get(key);
    if (!models) {
      try {
        const payload = await fetchProviderModels(providerSettings);
        models = payload.models || [];
        promptModelCache.set(key, models);
      } catch {
        models = [];
      }
    }
    return [...new Set([providerSettings.model, ...models].filter(Boolean))].map((model) =>
      promptCommandOption(model, model, titleCaseIdentifier(providerSettings.provider), model === providerSettings.model, { type: "model", value: model })
    );
  }
  if (command === "provider") {
    return providers.map((provider) => promptCommandOption(
      provider.id,
      provider.name,
      `${provider.type} · ${provider.model || "default model"}`,
      provider.selected === true,
      { type: "provider", value: provider.id },
    ));
  }
  if (command === "preset") {
    return presetConfigurations.map((preset) => promptCommandOption(
      preset.id, preset.name, presetMeta(preset), preset.id === activePresetId, { type: "preset", value: preset.id },
    ));
  }
  if (command === "prompts") {
    if (!systemPrompts.length) systemPrompts = await fetchSystemPrompts();
    return systemPrompts.map((prompt) => ({
      id: prompt.key,
      label: prompt.title,
      description: String(prompt.content || "").trim().split(/\r?\n/)[0] || "Empty prompt",
      action: { type: "prompt", value: prompt.key },
    }));
  }
  if (command === "skills") {
    if (!skills.length) skills = await fetchSkills();
    return skills.map((skill) => promptCommandOption(
      skill.id, skill.name, summarizeSkillContent(skill.content), skill.selected === true, { type: "skill", value: skill.id },
    ));
  }
  if (command === "tools") {
    return Object.entries(storedToolPermissions).map(([name, enabled]) => promptCommandOption(
      name, PRESET_STATUS_TOOL_LABELS[name] || titleCaseIdentifier(name), "Workspace tool", enabled, { type: "tool", value: name },
    ));
  }
  if (command === "mcp") {
    if (!toolsConfigContent) toolsConfigContent = (await fetchConfig()).content || "";
    return mcpBlocks(toolsConfigContent).map((block) => promptCommandOption(
      block.index, block.label, `${block.type} · ${block.detail}`, block.enabled, { type: "mcp", value: block.index },
    ));
  }
  if (command === "workflow") {
    const active = presetConfigurations.find((preset) => preset.id === activePresetId);
    const component = normalizeRigComponentState(active?.componentState);
    return Object.entries(component.effects).map(([name, enabled]) => promptCommandOption(
      name, PRESET_STATUS_WORKFLOW_LABELS[name] || titleCaseIdentifier(name), "Workflow stage", enabled, { type: "workflow", value: name },
    ));
  }
  return [];
}

async function showPromptCommandOptions({ command, query }) {
  const requestId = ++promptCommandRequestId;
  chatComponent.setCommandMenu([], { label: `/${command}`, emptyMessage: "Loading…" });
  try {
    const options = filterCommandOptions(await promptCommandOptions(command), query);
    if (requestId !== promptCommandRequestId) return;
    chatComponent.setCommandMenu(options, { label: `/${command}`, emptyMessage: "No matching options" });
  } catch (error) {
    if (requestId !== promptCommandRequestId) return;
    chatComponent.setCommandMenu([], { label: `/${command}`, emptyMessage: error.message });
  }
}

async function selectPromptCommand(item) {
  const { type, value } = item.action || {};
  if (type === "model") {
    const next = { ...providerSettings, model: value };
    providers = providers.map((provider) => provider.selected ? { ...provider, model: value } : provider);
    persistUiState(providers.length ? { providers } : { providerSettings: next });
    applyActiveProviderSettings(next);
  } else if (type === "provider") {
    const selected = providers.find((provider) => String(provider.id) === String(value));
    if (!selected) return;
    providers = providers.map((provider) => ({ ...provider, selected: provider.id === selected.id }));
    editingProviderId = selected.id;
    persistUiState({ providers });
    applyActiveProviderSettings(providerSettingsFromRecord(selected));
  } else if (type === "preset") {
    await activatePreset(value);
  } else if (type === "prompt") {
    await openSystemPromptsModal();
    const prompt = systemPrompts.find((entry) => entry.key === value);
    if (prompt) {
      editingSystemPromptKey = prompt.key;
      systemPromptEditorTitle.textContent = prompt.title;
      systemPromptContent.value = prompt.content;
      systemPromptsList.hidden = true;
      systemPromptEditor.hidden = false;
      saveSystemPromptButton.hidden = false;
      systemPromptContent.focus();
    }
  } else if (type === "skill") {
    const next = skills.map((skill) => String(skill.id) === String(value) ? { ...skill, selected: !skill.selected } : skill);
    const selectedIds = next.filter((skill) => skill.selected).map((skill) => skill.id);
    await persistSelectedSkills(selectedIds);
    skills = next;
    updateActivePresetSnapshot({ skillIds: selectedIds });
    send({ type: "reload_skills" });
  } else if (type === "tool") {
    storedToolPermissions = { ...storedToolPermissions, [value]: !storedToolPermissions[value] };
    updateActivePresetSnapshot({ toolPermissions: storedToolPermissions });
    persistUiState({ toolPermissions: storedToolPermissions });
    send({ type: "tool_permissions", permissions: storedToolPermissions });
  } else if (type === "mcp") {
    const block = mcpBlocks(toolsConfigContent).find((entry) => entry.index === Number(value));
    if (block) {
      toolsConfigContent = setToolBlockEnabled(toolsConfigContent, block, !block.enabled);
      await saveConfigContent(toolsConfigContent);
    }
  } else if (type === "workflow") {
    const index = presetConfigurations.findIndex((preset) => preset.id === activePresetId);
    if (index >= 0) {
      const active = presetConfigurations[index];
      const componentState = normalizeRigComponentState(active.componentState);
      componentState.effects[value] = !componentState.effects[value];
      const configurations = presetConfigurations.map((preset, presetIndex) => presetIndex === index
        ? { ...preset, componentState, updatedAt: Date.now() }
        : preset);
      await savePresetConfigurations(configurations, activePresetId, { syncRuntime: true, successMessage: "Workflow updated." });
    }
  }

  const isToggle = ["skill", "tool", "mcp", "workflow"].includes(type);
  if (isToggle) {
    const parsed = parsePromptCommand(promptInput.value);
    await showPromptCommandOptions({ command: parsed?.command?.name || type, query: parsed?.query || "" });
  } else {
    chatComponent.closeCommandMenu({ clearPrompt: true });
    promptInput.focus();
  }
}

function currentProviderSettings() {
  return {
    provider: providerSelect.value,
    model: providerModelInput.value.trim(),
    baseUrl: providerBaseUrlInput.value.trim(),
    apiKey: providerApiKeyInput.value.trim(),
  };
}

function applyActiveProviderSettings(settings) {
  providerSettings = { ...defaultProviderSettings(), ...(settings || {}) };
  renderProviderSummary(providerSettings);
  updateActivePresetSnapshot({ providerSettings });
  send({ type: "provider_settings", ...providerSettings });
}

function renderProviderSummary(settings = providerSettings, fallback = {}) {
  const matchedProviderId = matchingProviderId(providers, settings);
  const matchedProvider = providers.find((provider) => String(provider.id) === matchedProviderId);
  const providerName = matchedProvider?.name || titleCaseIdentifier(settings.provider || fallback.provider || "Provider");
  const modelName = settings.model || fallback.model || "default model";
  const model = normalizeProviderModels([matchedProvider?.model, ...(matchedProvider?.models || [])])
    .find((item) => item.id === modelName);
  const inputPrice = model?.inputCost === null || model?.inputCost === undefined
    ? "—"
    : formatTokenCost(model.inputCost);
  const outputPrice = model?.outputCost === null || model?.outputCost === undefined
    ? "—"
    : formatTokenCost(model.outputCost);

  providerShortcutName.textContent = providerName;
  providerShortcutModel.textContent = modelName;
  const catalogPath = modelsRoutePath(matchedProviderId);
  providerShortcutModel.href = catalogPath;
  providerShortcutPrice.href = catalogPath;
  providerShortcutPrice.textContent = `Input ${inputPrice} / Output ${outputPrice} per 1M`;
  const summary = `${providerName} · ${modelName} · Input ${inputPrice} / Output ${outputPrice} per 1M tokens`;
  workspaceMeta.title = summary;
  appRoot.querySelector("#providerShortcutButton").setAttribute("aria-label", `Manage providers. ${summary}`);
}

function providerFormRecord(existing = {}) {
  return {
    id: existing.id || randomUuid(),
    name: providerNameInput.value.trim() || `${providerSelect.value} provider`,
    type: providerSelect.value,
    model: providerModelInput.value.trim(),
    models: normalizeProviderModels(editingProviderModels),
    modelsLoadedAt: editingProviderModelsLoadedAt,
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
      applyActiveProviderSettings({
        provider: item.type,
        model: item.model,
        baseUrl: item.baseUrl,
        apiKey: item.apiKey,
      });
      editingProviderId = item.id;
      persistUiState({ providers });
      renderProvidersTable();
      renderProviderSettings(providerSettings, item.name);
    });
    selectCell.append(checkbox);
    row.append(selectCell);
    for (const value of [item.name, item.type, item.model || "Default"]) {
      const cell = document.createElement("td"); cell.textContent = value; row.append(cell);
    }
    const apiKeyCell = document.createElement("td");
    apiKeyCell.className = "providerKeyStatus";
    apiKeyCell.textContent = item.apiKey ? "••••••••" : item.type === "ollama" ? "Optional (local)" : "Not set";
    row.append(apiKeyCell);
    const actionCell = document.createElement("td");
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.textContent = "Edit";
    editButton.addEventListener("click", async () => {
      editingProviderId = item.id;
      renderProviderSettings(
        { provider: item.type, model: item.model, baseUrl: item.baseUrl, apiKey: item.apiKey },
        item.name,
        item.models,
        item.modelsLoadedAt,
      );
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
        applyActiveProviderSettings({
          provider: next.type, model: next.model, baseUrl: next.baseUrl, apiKey: next.apiKey,
        });
      } else if (deletedSelectedProvider) {
        applyActiveProviderSettings(defaultProviderSettings());
      }
      if (editingProviderId === item.id) editingProviderId = null;
      persistUiState({ providers });
      renderProvidersTable();
      renderProviderModelsTable();
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
  renderProviderSettings(defaultProviderSettings(), "", [], null);
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
  renderProviderModelsTable();
  const updated = providers.find((item) => item.id === editingProviderId);
  if (!updated || updated.selected) {
    applyActiveProviderSettings(settings);
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

async function saveToolPermissions() {
  try { await toolsModal.saveRuntimeSettings(); }
  catch (error) { toolPermissionsStatus.textContent = error.message; toolPermissionsStatus.dataset.state = 'error'; return; }
  const permissions = currentToolPermissions();
  storedToolPermissions = permissions;
  updateActivePresetSnapshot({ toolPermissions: permissions });
  persistUiState({ toolPermissions: permissions });
  send({ type: "tool_permissions", permissions });
  toolPermissionsStatus.textContent = "Tools and global runtime settings saved";
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
  const uniqueModels = [...new Set([selected, ...normalizeProviderModels(models).map((model) => model.id)].filter(Boolean))];
  for (const model of uniqueModels) {
    const option = document.createElement("option");
    option.value = model;
    option.textContent = model;
    providerModelInput.append(option);
  }
  providerModelInput.value = selected;
}

function renderProviderSettings(
  settings = providerSettings,
  name = providers.find((item) => item.selected)?.name || "",
  models,
  modelsLoadedAt,
) {
  const selectedProvider = providers.find((item) => item.selected);
  editingProviderModels = normalizeProviderModels(models ?? selectedProvider?.models);
  editingProviderModelsLoadedAt = Number(modelsLoadedAt ?? selectedProvider?.modelsLoadedAt) || null;
  providerNameInput.value = name;
  providerSelect.value = ["openai", "ollama", "custom"].includes(settings.provider)
    ? settings.provider
    : "openai";
  setModelOptions(editingProviderModels, settings.model || defaultModelForProvider(providerSelect.value));
  providerBaseUrlInput.value = settings.baseUrl || "";
  providerApiKeyInput.value = settings.apiKey || "";
  providerBaseUrlInput.placeholder = providerSelect.value === "ollama"
    ? "http://localhost:11434"
    : providerSelect.value === "custom"
      ? "http://localhost:8000/v1"
      : "https://api.openai.com/v1";
  providerApiKeyField.hidden = false;
  providerApiKeyInput.placeholder = providerSelect.value === "openai"
    ? "Required OpenAI API key"
    : providerSelect.value === "ollama"
      ? "Ollama Cloud API key (optional locally)"
      : "Optional bearer token";
}

async function loadProviderModels() {
  const current = currentProviderSettings();
  setProviderModelsStatus("Loading models...");
  refreshModelsButton.disabled = true;
  try {
    const payload = await fetchProviderModels(current);
    editingProviderModels = mergeRefreshedProviderModels(
      editingProviderModels,
      payload.modelDetails || payload.models,
    );
    editingProviderModelsLoadedAt = Date.now();
    setModelOptions(editingProviderModels, current.model);
    setProviderModelsStatus(`${editingProviderModels.length} model${editingProviderModels.length === 1 ? "" : "s"} loaded`, "success");
  } catch (error) {
    setModelOptions(editingProviderModels, current.model || defaultModelForProvider(current.provider));
    setProviderModelsStatus(error.message, "error");
  } finally {
    refreshModelsButton.disabled = false;
  }
}

function renderProviderModelsTable() {
  if (routeReady && providerModelsProviderId && !providers.some((provider) => String(provider.id) === providerModelsProviderId)) {
    providerModelsProviderId = "";
    if (modelsRouteProviderId(window.location.pathname) !== null) {
      window.history.replaceState({}, "", modelsRoutePath());
    }
  }
  const filterOptions = [
    { value: "", label: "All providers" },
    ...providers.map((provider) => ({ value: String(provider.id), label: provider.name || provider.type || "Provider" }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  ];
  const signature = JSON.stringify(filterOptions);
  if (providerModelsFilter.dataset.options !== signature) {
    providerModelsFilter.replaceChildren(...filterOptions.map(({ value, label }) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      return option;
    }));
    providerModelsFilter.dataset.options = signature;
  }
  providerModelsFilter.value = providerModelsProviderId;
  providerModelsTableBody.replaceChildren();
  for (const button of providerModelsSortButtons) {
    const selected = button.dataset.providerModelSort === providerModelsSort.key;
    button.dataset.direction = selected ? providerModelsSort.direction : "";
    button.closest("th").setAttribute(
      "aria-sort",
      selected ? (providerModelsSort.direction === "asc" ? "ascending" : "descending") : "none",
    );
  }
  const allModels = groupedProviderModels(providers).map((item) => ({
    ...item,
    details: item.details.map((detail) => ({
      ...detail,
      ...providerModelRating(detail.providerId, item.model),
    })),
  }));
  const models = filterAndSortProviderModels(allModels, {
    query: providerModelsQuery,
    providerId: providerModelsProviderId,
    ...providerModelsSort,
  });
  if (models.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 9;
    cell.textContent = providerModelsQuery
      ? `No models match “${providerModelsQuery}”.`
      : providers.length === 0
      ? "Add a provider to discover its models."
      : providerModelsProviderId
      ? "No models have been discovered for this provider yet."
      : "No models have been discovered yet.";
    row.append(cell);
    providerModelsTableBody.append(row);
    return;
  }
  for (const item of models) {
    const row = document.createElement("tr");
    const modelCell = document.createElement("td");
    modelCell.textContent = item.model;
    modelCell.title = item.model;
    const providersCell = document.createElement("td");
    providersCell.className = "providerModelNames";
    const providerBadges = document.createElement("div");
    providerBadges.className = "providerModelBadges";
    for (const [index, name] of item.providers.entries()) {
      if (index > 0) {
        const separator = document.createElement("span");
        separator.className = "providerModelSeparator";
        separator.textContent = "/";
        providerBadges.append(separator);
      }
      const badge = document.createElement("span");
      badge.textContent = name;
      providerBadges.append(badge);
    }
    providersCell.append(providerBadges);
    const metadata = [
      formatGroupedModelValue(item.details, "tools", formatToolSupport),
      formatGroupedModelValue(item.details, "throughput", (value) => `${formatMetric(value)} t/s`),
      formatGroupedModelValue(item.details, "latency", (value) => `${formatMetric(value)} ms`),
      formatGroupedModelValue(item.details, "context", formatContextSize),
      formatGroupedModelValue(item.details, "inputCost", formatTokenCost),
      formatGroupedModelValue(item.details, "outputCost", formatTokenCost),
    ];
    const actionsCell = document.createElement("td");
    actionsCell.className = "providerModelActionsCell";
    const useActions = document.createElement("div");
    useActions.className = "providerModelUseActions";
    const orderedDetails = [...item.details].sort((left, right) => (
      left.provider.localeCompare(right.provider)
      || String(left.providerId || "").localeCompare(String(right.providerId || ""))
    ));
    for (const [index, detail] of orderedDetails.entries()) {
      if (index > 0) {
        const separator = document.createElement("span");
        separator.textContent = "/";
        separator.setAttribute("aria-hidden", "true");
        useActions.append(separator);
      }
      const useButton = document.createElement("button");
      useButton.type = "button";
      useButton.className = "providerModelUseButton";
      useButton.textContent = "Use";
      const isActive = providers.some((provider) => (
        String(provider.id) === String(detail.providerId)
        && provider.selected === true
        && provider.model === item.model
      ));
      useButton.disabled = !detail.providerId || isActive;
      useButton.setAttribute("aria-pressed", String(isActive));
      useButton.title = isActive
        ? `Currently using ${item.model} with ${detail.provider}`
        : `Use ${item.model} with ${detail.provider}`;
      useButton.setAttribute("aria-label", useButton.title);
      useButton.addEventListener("click", () => useProviderModel(detail.providerId, item.model));
      useActions.append(useButton);
    }
    const testButton = document.createElement("button");
    testButton.type = "button";
    testButton.className = "providerModelTestButton";
    testButton.title = `Test latency and throughput for ${item.model}`;
    testButton.setAttribute("aria-label", testButton.title);
    const isTesting = testingProviderModels.has(item.model);
    testButton.disabled = isTesting;
    testButton.classList.toggle("is-testing", isTesting);
    testButton.setAttribute("aria-busy", String(isTesting));
    testButton.append(modelTestIcon());
    testButton.addEventListener("click", () => testModelPerformance(item));
    useActions.prepend(testButton);
    actionsCell.append(useActions);
    row.append(modelCell, providersCell, ...metadata.map((value, index) => {
      const cell = document.createElement("td");
      if (index === 6 && value.includes("★")) {
        value.split("★").forEach((part, partIndex) => {
          if (partIndex > 0) cell.append(bootstrapIcon("star-fill", "modelRatingIcon"));
          cell.append(document.createTextNode(part));
        });
      } else {
        cell.textContent = value;
      }
      if ((index === 4 || index === 5) && item.details.some((detail) => {
        const provider = providers.find((entry) => String(entry.id) === String(detail.providerId));
        try { return new URL(provider?.baseUrl).hostname === "api.deepseek.com"; } catch { return false; }
      })) {
        cell.title = "DeepSeek: peak rates per 1M tokens; input is uncached. Off-peak and cache-hit rates are lower.";
      }
      if ((index === 4 || index === 5) && item.details.some((detail) => {
        const provider = providers.find((entry) => String(entry.id) === String(detail.providerId));
        try { return new URL(provider?.baseUrl).hostname === "router.huggingface.co"; } catch { return false; }
      })) {
        cell.title = "Hugging Face: published rate for the fastest live upstream provider. Actual rates can change with routing.";
      }
      if ((index === 4 || index === 5) && item.details.some((detail) => {
        const provider = providers.find((entry) => String(entry.id) === String(detail.providerId));
        try { return new URL(provider?.baseUrl).hostname === "ollama.com"; } catch { return false; }
      })) {
        cell.title = "Ollama Cloud: uncached input and output rates per 1M tokens; peak rates shown where applicable.";
      }
      return cell;
    }), actionsCell);
    providerModelsTableBody.append(row);
  }
}

function useProviderModel(providerId, model) {
  const selected = providers.find((provider) => String(provider.id) === String(providerId));
  if (!selected) return;
  providers = providers.map((provider) => ({
    ...provider,
    selected: String(provider.id) === String(providerId),
    ...(String(provider.id) === String(providerId) ? { model } : {}),
  }));
  editingProviderId = selected.id;
  const settings = {
    provider: selected.type,
    model,
    baseUrl: selected.baseUrl,
    apiKey: selected.apiKey,
  };
  applyActiveProviderSettings(settings);
  persistUiState({ providers });
  renderProvidersTable();
  renderProviderModelsTable();
  renderProviderSettings(settings, selected.name, selected.models, selected.modelsLoadedAt);
  allProviderModelsStatus.textContent = `Using ${model} with ${selected.name}.`;
  allProviderModelsStatus.dataset.state = "success";
}

async function testModelPerformance(item) {
  if (testingProviderModels.has(item.model)) return;
  const providerIds = [...new Set(item.details.map((detail) => detail.providerId).filter(Boolean))];
  testingProviderModels.add(item.model);
  renderProviderModelsTable();
  allProviderModelsStatus.textContent = `Testing ${item.model} on ${providerIds.length} provider${providerIds.length === 1 ? "" : "s"}…`;
  allProviderModelsStatus.dataset.state = "";
  let completed = 0;
  const errors = [];
  try {
    for (const providerId of providerIds) {
      try {
        const result = await runProviderModelTest(providerId, item.model);
        providers = providers.map((provider) => {
          if (provider.id !== providerId) return provider;
          const models = normalizeProviderModels(provider.models).map((model) =>
            model.id === item.model ? { ...model, ...result.benchmark } : model);
          return { ...provider, models: normalizeProviderModels(models) };
        });
        completed += 1;
      } catch (error) {
        errors.push(error.message);
      }
    }
    allProviderModelsStatus.textContent = errors.length
      ? `${completed} provider test${completed === 1 ? "" : "s"} completed · ${errors.length} failed: ${errors[0]}`
      : `Performance test saved for ${item.model}.`;
    allProviderModelsStatus.dataset.state = errors.length ? "error" : "success";
  } finally {
    testingProviderModels.delete(item.model);
    renderProviderModelsTable();
  }
}

function sortProviderModels(key) {
  providerModelsSort = providerModelsSort.key === key
    ? { key, direction: providerModelsSort.direction === "asc" ? "desc" : "asc" }
    : { key, direction: "asc" };
  renderProviderModelsTable();
}

function formatGroupedModelValue(details, key, formatter) {
  return formatProviderModelValues(details, key, formatter);
}

function providerModelRating(providerId, model) {
  const ratings = taskRatings.filter((entry) => (
    String(entry.providerId) === String(providerId) && entry.model === model
  ));
  if (ratings.length === 0) return { rating: null, ratingCount: 0 };
  return {
    rating: ratings.reduce((sum, entry) => sum + entry.rating, 0) / ratings.length,
    ratingCount: ratings.length,
  };
}

function formatToolSupport(value) {
  return value ? "Yes" : "No";
}

function formatMetric(value) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value);
}

function formatContextSize(value) {
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function formatTokenCost(value) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  }).format(value * 1_000_000);
}

function renderRoute() {
  const routeProviderId = modelsRouteProviderId(window.location.pathname);
  const showModels = routeProviderId !== null;
  if (showModels) providerModelsProviderId = routeProviderId;
  appShell.classList.toggle("models-route", showModels);
  modelsPage.hidden = !showModels;
  providerShortcutModel.setAttribute("aria-current", showModels ? "page" : "false");
  appRoot.querySelector("#collapsedModelsLink").setAttribute("aria-current", showModels ? "page" : "false");
  document.title = showModels ? "Models · AI Harness" : "AI Harness";
  if (showModels && routeReady) loadAllProviderModels({ missingOnly: true });
}

function navigateRoute(path) {
  if (window.location.pathname !== path) window.history.pushState({}, "", path);
  renderRoute();
}

appRoot.addEventListener("click", (event) => {
  const link = event.target.closest("a[data-app-route]");
  if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  navigateRoute(link.getAttribute("href"));
});
window.addEventListener("popstate", renderRoute);
renderRoute();

async function loadAllProviderModels({ missingOnly = false } = {}) {
  const loadId = ++allProviderModelsLoadId;
  renderProviderModelsTable();
  if (providers.length === 0) {
    allProviderModelsStatus.textContent = "No providers configured.";
    return;
  }
  const targets = missingOnly
    ? providersNeedingInitialModelLoad(providers)
    : providers;
  if (targets.length === 0) {
    allProviderModelsStatus.textContent = `${groupedProviderModels(providers).length} cached models.`;
    return;
  }
  refreshAllProviderModelsButton.disabled = true;
  allProviderModelsStatus.textContent = `Loading models from ${targets.length} provider${targets.length === 1 ? "" : "s"}…`;
  allProviderModelsStatus.dataset.state = "";
  const results = await Promise.all(targets.map(async (provider) => {
    try {
      const payload = await fetchProviderModels({
        provider: provider.type,
        baseUrl: provider.baseUrl,
        apiKey: provider.apiKey,
      });
      return { id: provider.id, models: normalizeProviderModels(payload.modelDetails || payload.models) };
    } catch (error) {
      return { id: provider.id, error };
    }
  }));
  if (loadId !== allProviderModelsLoadId) return;
  const resultsById = new Map(results.map((result) => [result.id, result]));
  providers = providers.map((provider) => {
    const result = resultsById.get(provider.id);
    if (!result) return provider;
    return {
      ...provider,
      ...(result.models ? { models: mergeRefreshedProviderModels(provider.models, result.models) } : {}),
      modelsLoadedAt: Date.now(),
    };
  });
  try {
    await persistUiState({ providers });
    renderProviderModelsTable();
    renderProviderSummary();
    const failed = results.filter((result) => result.error).length;
    const count = groupedProviderModels(providers).length;
    allProviderModelsStatus.textContent = `${count} unique model${count === 1 ? "" : "s"} saved to SQLite${failed ? ` · ${failed} provider${failed === 1 ? "" : "s"} failed` : ""}.`;
    allProviderModelsStatus.dataset.state = failed ? "error" : "success";
  } catch (error) {
    allProviderModelsStatus.textContent = error.message;
    allProviderModelsStatus.dataset.state = "error";
  } finally {
    refreshAllProviderModelsButton.disabled = false;
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
    toolsConfigContent = configInput.value;
    updateActivePresetSnapshot({ mcpConfig: toolsConfigContent });
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
  toolsConfigContent = content;
  updateActivePresetSnapshot({ mcpConfig: content });
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
    const headers = httpHeadersToml(toolHeadersInput.value);
    return `[[mcp.servers]]
server_label = "${quoteToml(label)}"
server_url = "${quoteToml(url)}"
require_approval = "never"${headers ? `\n\n${headers}` : ""}`;
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
  appRoot.querySelectorAll(".remoteToolField").forEach((field) => {
    field.hidden = !remote;
  });
  appRoot.querySelectorAll(".stdioToolField").forEach((field) => {
    field.hidden = remote;
  });
}

function clearMcpEditor() {
  editingMcpBlock = null;
  toolTypeSelect.value = "remote";
  toolTypeSelect.disabled = false;
  toolLabelInput.value = "";
  toolUrlInput.value = "";
  toolHeadersInput.value = "";
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
    toolHeadersInput.value = formatHttpHeaders(block.headers);
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

async function loadHealth(initialHealth = null) {
  try {
    const health = initialHealth || await fetchHealth();
    presetStatusBar.hidden = health.environmentFileDetected === true;
    toggleFilesColumnButton.hidden = health.fileAccessDisabledByEnvironment === true;
    if (health.fileAccessDisabledByEnvironment === true) applyFilesColumnState(false);
    defaultWorkspace = health.workspaceConfiguredByEnvironment
      ? health.workspace
      : loadDefaultWorkspace() || health.workspace || ".";
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
    renderProviderSummary(settings, health);
  } catch {
    providerShortcutName.textContent = "Server health unavailable";
    providerShortcutModel.textContent = "Models";
    providerShortcutPrice.textContent = "";
    workspaceMeta.title = "Server health unavailable";
    appRoot.querySelector("#providerShortcutButton").setAttribute("aria-label", "Manage providers. Server health unavailable");
  }
}

const permissionDialogs = new Map();

async function handleSocketMessage(payload) {
    if (payload.type === 'permission_closed') {
      addEvent(`Permission ${payload.approved ? 'granted' : 'denied'}: ${payload.tool}`, { target: payload.target, approved: payload.approved });
      permissionDialogs.get(payload.id)?.remove();
      permissionDialogs.delete(payload.id);
      return;
    }
    if (payload.type === 'permission_request') {
      const dialog = document.createElement('dialog');
      dialog.className = 'permissionDialog';
      const title = document.createElement('h2');
      title.textContent = 'Allow this tool call?';
      const details = document.createElement('pre');
      details.textContent = `${payload.tool}\n${payload.target}${payload.preview ? `\n\n${payload.preview}` : ''}`;
      const reply = (approved) => {
        send({ type: 'permission_response', id: payload.id, sessionId: payload.sessionId, approved });
        dialog.remove(); permissionDialogs.delete(payload.id);
      };
      const deny = document.createElement('button');
      deny.textContent = 'Deny'; deny.autofocus = true;
      deny.addEventListener('click', () => reply(false));
      const allow = document.createElement('button');
      allow.textContent = 'Allow once';
      allow.addEventListener('click', () => reply(true));
      dialog.addEventListener('cancel', (event) => { event.preventDefault(); reply(false); });
      dialog.append(title, details, deny, allow);
      (appRoot === document ? document.body : appRoot).append(dialog); permissionDialogs.set(payload.id, dialog); dialog.showModal();
      return;
    }
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
      if (shouldRefreshWorkspaceForAgentEvent(payload.event)) scheduleWorkspaceTreeRefresh();
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
    if (payload.type === "stopped") {
      const targetSessionId = payload.sessionId || pendingSessionId || activeSessionId;
      const partial = streamingAnswer?.sessionId === targetSessionId ? streamingAnswer.text : "";
      if (partial) await addMessageToSession(targetSessionId, "agent", partial);
      addEvent("Run stopped", { type: "run_stopped" });
      finishStreamingAnswer();
      pendingSessionId = null;
      setBusy(false);
      if (targetSessionId === activeSessionId) renderMessages();
      scheduleWorkspaceTreeRefresh(0);
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
      scheduleWorkspaceTreeRefresh(0);
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
      finishStreamingAnswer();
      pendingSessionId = null;
      setBusy(false);
      scheduleWorkspaceTreeRefresh(0);
    }
}

function connect() {
  socketService = new SocketService({
    onOpen() {
      send({ type: "provider_settings", ...providerSettings });
      send({ type: "tool_permissions", permissions: storedToolPermissions });
      setBusy(false);
      addEvent("Socket connected");
    },
    onClose() {
      for (const dialog of permissionDialogs.values()) dialog.remove();
      permissionDialogs.clear();
      setBusy(false);
      addEvent("Socket closed");
      window.setTimeout(connect, 1500);
    },
    onError() {
      addEvent("Socket error");
    },
    onMessage: handleSocketMessage,
  });
  socketService.connect();
}

chatComponent.addEventListener("stop-run", () => {
  if (!runActive || stopRequested || !socketService?.isOpen) return;
  if (socketService.send({ type: "stop", sessionId: pendingSessionId || activeSessionId })) {
    stopRequested = true;
    renderSendButton();
  }
});

chatComponent.addEventListener("submit-prompt", () => {
  const prompt = promptInput.value.trim();
  if ((!prompt && attachedImages.length === 0) || runActive || !socketService?.isOpen) return;
  const sessionId = activeSessionId;
  const session = activeSession();
  const history = session ? [...session.messages] : [];
  const images = attachedImages;
  const displayPrompt = prompt || "Analyze attached image";
  addMessageToSession(
    sessionId,
    "user",
    displayPrompt,
    images,
  );
  renderMessages();
  const matchedProviderId = matchingProviderId(providers, providerSettings);
  const matchedProvider = providers.find((provider) => String(provider.id) === matchedProviderId);
  const activeModel = normalizeProviderModels([matchedProvider?.model, ...(matchedProvider?.models || [])])
    .find((model) => model.id === providerSettings.model);
  const activePreset = presetConfigurations.find((configuration) => configuration.id === activePresetId);
  const effectiveSystemPrompts = activePreset?.systemPrompts
    || Object.fromEntries(systemPrompts.map((entry) => [entry.key, entry.content]));
  const effectiveToolPermissions = activePreset?.toolPermissions || storedToolPermissions;
  const presetSnapshot = activePreset || {
    name: "Current settings",
    providerSettings,
    toolPermissions: effectiveToolPermissions,
    systemPrompts: effectiveSystemPrompts,
    mcpConfig: toolsConfigContent,
  };
  addEvent("Prompt sent", {
    runId: randomUuid(),
    messageIndex: session.messages.length - 1,
    prompt: images.length > 0 ? `${displayPrompt} (${images.length} image)` : displayPrompt,
    providerId: matchedProviderId,
    providerName: matchedProvider?.name || titleCaseIdentifier(providerSettings.provider),
    provider: providerSettings.provider,
    model: providerSettings.model,
    inputCost: activeModel?.inputCost ?? null,
    outputCost: activeModel?.outputCost ?? null,
    presetSettings: JSON.parse(JSON.stringify(presetSnapshot)),
    tools: {
      permissions: { ...effectiveToolPermissions },
      enabled: Object.entries(effectiveToolPermissions).filter(([, enabled]) => enabled).map(([name]) => name),
      mcpConfig: activePreset?.mcpConfig || toolsConfigContent,
    },
    systemPrompts: { ...effectiveSystemPrompts },
  });
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
workspaceComponent.addEventListener("copy-workspace-path", copyWorkspacePath);
copyFilePreviewButton.addEventListener("click", copyFilePreviewSource);
fileEditorDialog.addEventListener("close", () => {
  previewingFilePath = null;
  window.clearTimeout(filePreviewStatusTimer);
  setFilePreviewClipboardValue(null);
  fileEditorPreviewImage.removeAttribute("src");
  fileEditorPreviewHtml.removeAttribute("srcdoc");
});
workspaceComponent.addEventListener("focus-prompt", () => promptInput.focus());
workspaceComponent.addEventListener("refresh-workspace", loadWorkspaceTree);
workspaceComponent.addEventListener("choose-workspace", openWorkspacePicker);
workspaceComponent.addEventListener("upload-files", (event) => uploadDroppedWorkspaceFiles(event.detail.files));
workspacePickerModal.addEventListener("create-workspace", openCreateWorkspaceDialog);
createWorkspaceModal.addEventListener("create-workspace-confirm", createAndSelectWorkspace);
chatComponent.addEventListener("images-selected", async (event) => addImages(event.detail.files));
chatComponent.addEventListener("toggle-microphone", toggleMicrophone);
chatComponent.addEventListener("prompt-command-query", (event) => showPromptCommandOptions(event.detail));
chatComponent.addEventListener("prompt-command-select", async (event) => {
  try {
    await selectPromptCommand(event.detail.item);
  } catch (error) {
    chatComponent.setCommandMenu([], { label: "Command failed", emptyMessage: error.message });
  }
});
chatComponent.addEventListener("prompt-edited", resetPromptHistoryCursor);
chatComponent.addEventListener("navigate-prompt-history", (event) => navigatePromptHistory(event.detail.direction));
chatComponent.addEventListener("toggle-files-column", toggleFilesColumn);
sidebarComponent.addEventListener("new-chat", startNewChat);
sidebarComponent.addEventListener("toggle-sidebar", toggleSidebar);

sidebarResizeHandle.addEventListener("column-resize-start", (event) => startSidebarResize(event.detail.sourceEvent));
sidebarResizeHandle.addEventListener("column-resize-key", (event) => {
  if (appShell.classList.contains("sidebar-collapsed")) {
    applySidebarState(false);
    localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, "false");
  }
  setSidebarWidth(sidebarWidth + (event.detail.key === "ArrowLeft" ? -24 : 24));
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
  selectWorkspace(pendingWorkspacePath);
});
workspacePickerDialog.addEventListener("cancel", (event) => {
  if (selectingDefaultWorkspace) event.preventDefault();
});
window.addEventListener("resize", () => {
  setFilesWidth(filesWidth);
});

function openProvidersModal() {
  renderProvidersTable();
  renderProviderModelsTable();
  providerSettingsSection.classList.remove("editor-open");
  providerEditor.hidden = true;
  saveSettingsButton.hidden = true;
  settingsStatus.textContent = "Provider settings are stored in SQLite.";
  settingsStatus.dataset.state = "";
  if (!settingsDialog.open) settingsDialog.showModal();
}

async function openSkillsModal() {
  closeSkillEditor();
  skillsSearchInput.value = "";
  if (!skillsDialog.open) skillsDialog.showModal();
  skillsStatus.textContent = "Loading skills from SQLite...";
  skillsStatus.dataset.state = "";
  try {
    await loadSkills();
    skillsStatus.textContent = "Skill selections are stored in SQLite.";
    skillsStatus.dataset.state = "";
  } catch (error) {
    skillsStatus.textContent = error.message;
    skillsStatus.dataset.state = "error";
  }
}

async function openSystemPromptsModal() {
  systemPromptEditor.hidden = true;
  systemPromptsList.hidden = false;
  saveSystemPromptButton.hidden = true;
  if (!systemPromptsDialog.open) systemPromptsDialog.showModal();
  try {
    await loadSystemPrompts();
  } catch (error) {
    systemPromptsStatus.textContent = error.message;
    systemPromptsStatus.dataset.state = "error";
  }
}

function openToolsModal() {
  if (!toolsDialog.open) toolsDialog.showModal();
  renderToolPermissions();
  toolsModal.loadRuntimeSettings().catch((error) => { toolPermissionsStatus.textContent = error.message; toolPermissionsStatus.dataset.state = 'error'; });
  toolPermissionsStatus.textContent = "Tool permissions are stored in the active preset.";
  toolPermissionsStatus.dataset.state = "";
}

function normalizeSubAgentDrafts(value = []) {
  const names = new Set();
  return (Array.isArray(value) ? value : []).map((worker) => {
    const name = String(worker?.name || "").trim();
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(name)) {
      throw new Error("Worker names must use 1–64 letters, numbers, hyphens, or underscores.");
    }
    if (names.has(name)) throw new Error(`Worker name “${name}” is already configured.`);
    names.add(name);
    let url;
    try {
      url = new URL(String(worker?.url || "").trim());
    } catch {
      throw new Error(`Enter a valid URL for “${name}”.`);
    }
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
      throw new Error(`Worker “${name}” must use an HTTP(S) URL without embedded credentials.`);
    }
    if (url.hostname === "0.0.0.0") url.hostname = "127.0.0.1";
    if (url.hostname === "[::]") url.hostname = "[::1]";
    url.search = "";
    url.hash = "";
    return { name, url: url.href.replace(/\/$/, "") };
  });
}

function setSubAgentsPending(pending) {
  showAddSubAgentButton.disabled = pending;
  saveSubAgentsButton.disabled = pending;
  for (const control of subAgentsList.querySelectorAll("input, button")) control.disabled = pending;
  for (const control of subAgentEditor.querySelectorAll("input, button")) control.disabled = pending;
  saveSubAgentsButton.textContent = pending ? "Saving…" : "Save sub-agents";
}

function renderSubAgents() {
  subAgentsList.replaceChildren();
  if (subAgentDrafts.length === 0) {
    const empty = document.createElement("p");
    empty.className = "emptyTools";
    empty.textContent = "No Agent Workers are configured for this preset.";
    subAgentsList.append(empty);
    return;
  }
  subAgentDrafts.forEach((worker, index) => {
    const row = document.createElement("div");
    row.className = "subAgentRow";

    const name = document.createElement("input");
    name.type = "text";
    name.maxLength = 64;
    name.value = worker.name;
    name.setAttribute("aria-label", `Worker ${index + 1} name`);
    name.addEventListener("input", () => { subAgentDrafts[index].name = name.value; });

    const url = document.createElement("input");
    url.type = "url";
    url.value = worker.url;
    url.setAttribute("aria-label", `Worker ${index + 1} URL`);
    url.addEventListener("input", () => { subAgentDrafts[index].url = url.value; });

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "subAgentDeleteButton";
    remove.textContent = "Remove";
    remove.setAttribute("aria-label", `Remove ${worker.name || `worker ${index + 1}`}`);
    remove.addEventListener("click", () => {
      subAgentDrafts.splice(index, 1);
      renderSubAgents();
      subAgentsStatus.textContent = "Unsaved sub-agent changes.";
      subAgentsStatus.dataset.state = "";
    });
    row.append(name, url, remove);
    subAgentsList.append(row);
  });
}

function closeSubAgentEditor() {
  subAgentEditor.hidden = true;
  subAgentNameInput.value = "";
  subAgentUrlInput.value = "";
}

function openSubAgentEditor() {
  subAgentEditor.hidden = false;
  subAgentNameInput.focus();
}

function addSubAgentDraft() {
  try {
    subAgentDrafts = normalizeSubAgentDrafts([
      ...subAgentDrafts,
      { name: subAgentNameInput.value, url: subAgentUrlInput.value },
    ]);
    renderSubAgents();
    closeSubAgentEditor();
    subAgentsStatus.textContent = "Worker added. Save to update the active preset.";
    subAgentsStatus.dataset.state = "success";
  } catch (error) {
    subAgentsStatus.textContent = error.message;
    subAgentsStatus.dataset.state = "error";
  }
}

function openSubAgentsModal() {
  const active = presetConfigurations.find((configuration) => configuration.id === activePresetId);
  if (!active) return;
  closeSubAgentEditor();
  subAgentDrafts = structuredClone(active.subAgents || []);
  renderSubAgents();
  subAgentsDialogDescription.textContent = `${active.name} · configure asynchronous Agent Workers`;
  subAgentsStatus.textContent = runActive
    ? "Stop the active run before changing sub-agents."
    : "Workers are stored in the active preset.";
  subAgentsStatus.dataset.state = runActive ? "error" : "";
  setSubAgentsPending(runActive);
  if (!subAgentsDialog.open) subAgentsDialog.showModal();
}

async function saveSubAgents() {
  const index = presetConfigurations.findIndex((configuration) => configuration.id === activePresetId);
  if (index < 0 || presetMutationPending || runActive) return;
  let subAgents;
  try {
    subAgents = normalizeSubAgentDrafts(subAgentDrafts);
  } catch (error) {
    subAgentsStatus.textContent = error.message;
    subAgentsStatus.dataset.state = "error";
    return;
  }
  const active = presetConfigurations[index];
  const configurations = presetConfigurations.map((configuration, configurationIndex) => (
    configurationIndex === index
      ? { ...configuration, subAgents, updatedAt: Date.now() }
      : configuration
  ));
  setSubAgentsPending(true);
  subAgentsStatus.textContent = "Saving sub-agents…";
  subAgentsStatus.dataset.state = "";
  const saved = await savePresetConfigurations(configurations, activePresetId, {
    syncRuntime: true,
    successMessage: "Sub-agents updated.",
  });
  setSubAgentsPending(false);
  if (saved) {
    addEvent("Sub-agents updated", `${active.name} · ${subAgents.length} configured`);
    subAgentsDialog.close();
  } else {
    subAgentsStatus.textContent = presetsStatus.textContent || "Unable to save sub-agents.";
    subAgentsStatus.dataset.state = "error";
  }
}

async function openMcpModal() {
  if (!mcpDialog.open) mcpDialog.showModal();
  closeMcpEditor();
  await loadTools();
}

async function openPresetsModal() {
  if (!presetsDialog.open) presetsDialog.showModal();
  await loadPresets();
}

function setWorkflowPending(pending) {
  workflowInputSource.disabled = pending;
  for (const input of workflowEffectInputs) input.disabled = pending;
  saveWorkflowButton.disabled = pending;
  saveWorkflowButton.textContent = pending ? "Saving…" : "Save workflow";
}

function openWorkflowSettings() {
  const active = presetConfigurations.find((configuration) => configuration.id === activePresetId);
  if (!active) return;
  const component = normalizeRigComponentState(active.componentState);
  workflowDialogDescription.textContent = `${active.name} · configure the active preset's processing stages`;
  workflowInputSource.value = component.inputSource;
  for (const input of workflowEffectInputs) input.checked = component.effects[input.dataset.workflowEffect] !== false;
  workflowModal.syncDiagram();
  workflowStatus.textContent = runActive
    ? "Stop the active run before changing workflow settings."
    : "Workflow settings are stored in the active preset.";
  workflowStatus.dataset.state = runActive ? "error" : "";
  setWorkflowPending(runActive);
  if (!workflowDialog.open) workflowDialog.showModal();
}

async function saveWorkflowSettings() {
  const index = presetConfigurations.findIndex((configuration) => configuration.id === activePresetId);
  if (index < 0 || presetMutationPending || runActive) return;
  const current = presetConfigurations[index];
  const componentState = normalizeRigComponentState({
    ...current.componentState,
    inputSource: workflowInputSource.value,
    effects: Object.fromEntries(workflowEffectInputs.map((input) => [input.dataset.workflowEffect, input.checked])),
  });
  const updated = { ...current, componentState, updatedAt: Date.now() };
  const configurations = presetConfigurations.map((configuration, configurationIndex) =>
    configurationIndex === index ? updated : configuration
  );
  setWorkflowPending(true);
  workflowStatus.textContent = "Saving workflow...";
  workflowStatus.dataset.state = "";
  const saved = await savePresetConfigurations(configurations, activePresetId, {
    syncRuntime: true,
    successMessage: "Workflow updated.",
  });
  setWorkflowPending(false);
  if (saved) {
    workflowStatus.textContent = "Workflow saved to the active preset.";
    workflowStatus.dataset.state = "success";
    addEvent("Workflow updated", `${updated.name} · ${Object.values(componentState.effects).filter(Boolean).length}/4 stages`);
    workflowDialog.close();
  } else {
    workflowStatus.textContent = presetsStatus.textContent || "Unable to save workflow.";
    workflowStatus.dataset.state = "error";
  }
}

appRoot.querySelector("#providerShortcutButton").addEventListener("click", openProvidersModal);

sidebarComponent.addEventListener("open-modal", async (event) => {
  if (event.detail.modal === "providers") openProvidersModal();
  if (event.detail.modal === "system-prompts") {
    await openSystemPromptsModal();
  }
  if (event.detail.modal === "skills") {
    await openSkillsModal();
  }
  if (event.detail.modal === "tools") {
    openToolsModal();
  }
  if (event.detail.modal === "mcp") {
    await openMcpModal();
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
modelsPage.addEventListener("refresh-all-provider-models", () => loadAllProviderModels());
modelsPage.addEventListener("provider-model-search", (event) => {
  providerModelsQuery = event.detail.query;
  renderProviderModelsTable();
});
modelsPage.addEventListener("provider-model-filter", (event) => {
  navigateRoute(modelsRoutePath(event.detail.providerId));
});
modelsPage.addEventListener("provider-model-sort", (event) => sortProviderModels(event.detail.key));
providersModal.addEventListener("add-provider", addProvider);
mcpModal.addEventListener("reload-mcp-config", loadConfig);
mcpModal.addEventListener("save-mcp-config", saveConfig);
mcpModal.addEventListener("reload-mcp-tools", loadTools);
mcpModal.addEventListener("show-mcp-editor", () => openMcpEditor());
mcpModal.addEventListener("cancel-mcp-editor", closeMcpEditor);
providersModal.addEventListener("save-provider-settings", saveProviderSettings);
toolsModal.addEventListener("save-tool-permissions", saveToolPermissions);
toolsModal.addEventListener('load-change-history', loadChangeHistory);
toolsModal.addEventListener('inspect-javascript', async () => {
  const result = toolsModal.querySelector('#javascriptResults');
  const button = toolsModal.querySelector('#inspectJavaScript');
  button.disabled = true; result.textContent = 'Inspecting…';
  try {
    const response = await fetch('/api/javascript', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workspace: activeSession()?.workspace || defaultWorkspace, path: toolsModal.querySelector('#javascriptPath').value, action: toolsModal.querySelector('#javascriptAction').value, query: toolsModal.querySelector('#javascriptQuery').value }) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error);
    result.textContent = JSON.stringify(payload, null, 2);
  } catch (error) { result.textContent = error.message; }
  finally { button.disabled = false; }
});
async function loadChangeHistory() {
  const list = toolsModal.querySelector('#changeHistoryList');
  const preview = toolsModal.querySelector('#changeHistoryPreview');
  const workspace = activeSession()?.workspace || defaultWorkspace;
  try {
    const response = await fetch(`/api/changes?${new URLSearchParams({ workspace })}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    list.replaceChildren();
    if (!data.changes.length) list.textContent = 'No tracked changes in this workspace.';
    for (const change of data.changes) {
      const row = document.createElement('div');
      const text = document.createElement('span');
      text.textContent = `${new Date(change.at).toLocaleString()} · ${change.state} · ${change.paths.join(', ')} `;
      row.append(text);
      for (const action of ['inspect', ...(change.state === 'undone' ? ['redo'] : ['undo'])]) {
        const button = document.createElement('button');
        button.type = 'button'; button.textContent = action === 'inspect' ? 'Review' : action === 'undo' ? 'Undo' : 'Redo';
        button.addEventListener('click', async () => {
          button.disabled = true;
          try {
            const result = action === 'inspect'
              ? await fetch(`/api/changes?${new URLSearchParams({ workspace, id: change.id, action: 'inspect' })}`)
              : await fetch('/api/changes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workspace, id: change.id, action }) });
            const payload = await result.json();
            if (!result.ok) throw new Error(payload.error);
            preview.textContent = action === 'inspect' ? payload.change.files.map((file) => `${file.diff || file.path}${file.truncated ? '\n[preview truncated]' : ''}`).join('\n\n') : `${action} completed: ${change.paths.join(', ')}`;
            if (action !== 'inspect') { await loadChangeHistory(); loadWorkspaceTree(); }
          } catch (error) { preview.textContent = error.message; }
          finally { button.disabled = false; }
        });
        row.append(button);
      }
      list.append(row);
    }
  } catch (error) { preview.textContent = error.message; }
}
subAgentsModal.addEventListener("show-sub-agent-editor", openSubAgentEditor);
subAgentsModal.addEventListener("cancel-sub-agent-editor", closeSubAgentEditor);
subAgentsModal.addEventListener("add-sub-agent", addSubAgentDraft);
subAgentsModal.addEventListener("save-sub-agents", saveSubAgents);
workflowModal.addEventListener("save-workflow", saveWorkflowSettings);
workflowModal.addEventListener("workflow-draft-change", () => {
  workflowStatus.textContent = "Unsaved workflow changes.";
  workflowStatus.dataset.state = "";
});
presetsModal.addEventListener("create-preset", duplicateActivePreset);
presetsModal.addEventListener("cancel-preset-edit", closePresetEditor);
presetsModal.addEventListener("save-preset-edit", savePresetEdit);
presetsModal.addEventListener("preset-provider-change", selectPresetProvider);
presetsModal.addEventListener("preset-skill-search", renderPresetSkills);
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
  editingProviderModels = [];
  editingProviderModelsLoadedAt = null;
  setModelOptions([], defaultModelForProvider(nextProvider));
  renderProviderSettings(currentProviderSettings(), providerName, [], null);
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
  renderSessionActivity();
  send({ type: "reset", sessionId: activeSessionId });
});

async function initialize() {
  let state = {};
  let shouldOpenProvidersModal = false;
  let initialHealth = null;
  try {
    initialHealth = await fetchHealth();
  } catch {
    // loadHealth reports the unavailable server after the local UI is restored.
  }
  const environmentWorkspaceConfigured = initialHealth?.workspaceConfiguredByEnvironment === true;
  const fileAccessDisabledByEnvironment = initialHealth?.fileAccessDisabledByEnvironment === true;
  const storedDefaultWorkspace = environmentWorkspaceConfigured
    ? initialHealth.workspace
    : loadDefaultWorkspace();
  const needsDefaultWorkspace = !storedDefaultWorkspace;
  if (storedDefaultWorkspace) defaultWorkspace = storedDefaultWorkspace;
  const localSidebarWidth = Number(localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY));
  const localFilesWidth = Number(localStorage.getItem(FILES_WIDTH_STORAGE_KEY));
  sidebarWidth = Number.isFinite(localSidebarWidth) && localSidebarWidth > 0 ? localSidebarWidth : 344;
  filesWidth = Number.isFinite(localFilesWidth) && localFilesWidth > 0 ? localFilesWidth : 300;
  applySidebarState(localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "true");
  applyFilesColumnState(fileAccessDisabledByEnvironment
    ? false
    : localStorage.getItem(FILES_VISIBLE_STORAGE_KEY) !== "false");
  setSidebarWidth(sidebarWidth);
  setFilesWidth(filesWidth);
  renderPresetStatusBar();
  try {
    state = await loadUiState();
    sessions = Array.isArray(state.sessions) && state.sessions.length > 0
      ? state.sessions.map((session) => ({
        ...session,
        messages: Array.isArray(session.messages) ? session.messages : [],
        events: Array.isArray(session.events) ? session.events : [],
        workspace: environmentWorkspaceConfigured ? defaultWorkspace : session.workspace || defaultWorkspace,
      }))
      : [createSession("AI Harness Session", defaultWorkspace)];
    providerSettings = { ...defaultProviderSettings(), ...(state.providerSettings || {}) };
    providers = normalizeProviderRecords(state.providers);
    shouldOpenProvidersModal = providers.length === 0;
    editingProviderId = providers.find((item) => item.selected)?.id || null;
    storedToolPermissions = normalizeToolPermissions(state.toolPermissions);
  } catch (error) {
    sessions = [createSession("AI Harness Session", defaultWorkspace)];
    addEvent("UI state load failed", error.message, { persist: false });
  }
  const storedActiveSessionId = localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY);
  activeSessionId = sessions.some((session) => session.id === storedActiveSessionId)
    ? storedActiveSessionId
    : sessions[0].id;
  localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, activeSessionId);
  try {
    taskRatings = await fetchTaskRatings();
  } catch {
    taskRatings = [];
  }
  renderProviderSettings();
  renderToolPermissions();
  renderRecents();
  renderMessages();
  renderSessionActivity();
  renderWorkspace();
  resizePromptInput();
  await loadPresetSummary();
  await loadHealth(initialHealth);
  await loadWorkspaceTree();
  routeReady = true;
  renderRoute();
  const viewingModels = appShell.classList.contains("models-route");
  if (!viewingModels && needsDefaultWorkspace) {
    openProvidersAfterWorkspaceSelection = shouldOpenProvidersModal;
    await openDefaultWorkspacePicker();
  } else if (!viewingModels && shouldOpenProvidersModal) {
    openProvidersModal();
  }
  connect();
}

initialize();
setInterval(refreshRunningStepDurations, 1000);
