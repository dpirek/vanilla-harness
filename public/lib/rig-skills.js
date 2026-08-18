import { codeLanguageLabel, highlightCode, normalizeCodeLanguage } from "./file-utils.js";
import { element, showTransientDialog } from "./dom.js";
import {
  createSkill as persistCreatedSkill,
  loadSkills as fetchSkills,
  saveSelectedSkills as persistSelectedSkills,
  saveSkillContent as persistSkillContent,
} from "../services/settings-api.js";

const DEFAULT_RIG_SKILLS_STATUS = "Selected skills here are added to new harness sessions. Click a skill to edit it.";

function summarizeRigSkillSource(sourcePath = "") {
  const parts = String(sourcePath).split("/").filter(Boolean);
  return parts.slice(-4).join("/");
}

function summarizeRigSkillContent(content = "") {
  return String(content)
    .split(/\r?\n/)
    .find((line) => line.trim() && !line.trim().startsWith("#"))
    || "SKILL.md";
}

function appendInlineMarkdown(container, text) {
  const value = String(text || "");
  const pattern = /(`[^`]+`)|(\[[^\]]+\]\(([^)]+)\))|(\*\*[^*]+\*\*)|(\*[^*]+\*)/g;
  let cursor = 0;
  for (const match of value.matchAll(pattern)) {
    if (match.index > cursor) container.append(document.createTextNode(value.slice(cursor, match.index)));
    if (match[1]) {
      const code = document.createElement("code");
      code.textContent = match[1].slice(1, -1);
      container.append(code);
    } else if (match[2]) {
      const link = document.createElement("a");
      link.href = match[3];
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = match[2].slice(1, match[2].indexOf("]("));
      container.append(link);
    } else if (match[4]) {
      const strong = document.createElement("strong");
      strong.textContent = match[4].slice(2, -2);
      container.append(strong);
    } else if (match[5]) {
      const emphasis = document.createElement("em");
      emphasis.textContent = match[5].slice(1, -1);
      container.append(emphasis);
    }
    cursor = match.index + match[0].length;
  }
  if (cursor < value.length) container.append(document.createTextNode(value.slice(cursor)));
}

function appendMarkdownParagraph(container, lines) {
  const text = lines.join(" ").trim();
  if (!text) return;
  const paragraph = document.createElement("p");
  appendInlineMarkdown(paragraph, text);
  container.append(paragraph);
}

function appendMarkdownCodeBlock(container, code, language = "") {
  const normalized = normalizeCodeLanguage(language);
  const block = document.createElement("div");
  block.className = "codeBlock";
  const label = document.createElement("div");
  label.className = "codeLanguage";
  label.textContent = codeLanguageLabel(normalized);
  const pre = document.createElement("pre");
  const codeNode = document.createElement("code");
  codeNode.className = normalized ? `language-${normalized}` : "";
  codeNode.append(highlightCode(code.replace(/\r?\n$/, ""), normalized));
  pre.append(codeNode);
  block.append(label, pre);
  container.append(block);
}

function renderSkillMarkdown(container, content = "") {
  container.replaceChildren();
  const lines = String(content || "").split(/\r?\n/);
  const paragraphLines = [];
  let currentList = null;
  let codeFenceLanguage = "";
  let codeFenceLines = null;

  const flushParagraph = () => {
    if (!paragraphLines.length) return;
    appendMarkdownParagraph(container, paragraphLines.splice(0));
  };

  const flushList = () => {
    if (!currentList) return;
    container.append(currentList);
    currentList = null;
  };

  for (const line of lines) {
    if (codeFenceLines) {
      if (/^```/.test(line.trim())) {
        appendMarkdownCodeBlock(container, codeFenceLines.join("\n"), codeFenceLanguage);
        codeFenceLines = null;
        codeFenceLanguage = "";
      } else {
        codeFenceLines.push(line);
      }
      continue;
    }

    const fenceMatch = line.match(/^```([\w+-]*)\s*$/);
    if (fenceMatch) {
      flushParagraph();
      flushList();
      codeFenceLanguage = fenceMatch[1];
      codeFenceLines = [];
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,4})\s+(.*)$/);
    if (headingMatch) {
      flushParagraph();
      flushList();
      const heading = document.createElement(`h${Math.min(4, headingMatch[1].length)}`);
      appendInlineMarkdown(heading, headingMatch[2]);
      container.append(heading);
      continue;
    }

    if (/^---+$/.test(trimmed) || /^\*\*\*+$/.test(trimmed)) {
      flushParagraph();
      flushList();
      container.append(document.createElement("hr"));
      continue;
    }

    const quoteMatch = trimmed.match(/^>\s?(.*)$/);
    if (quoteMatch) {
      flushParagraph();
      flushList();
      const quote = document.createElement("blockquote");
      const paragraph = document.createElement("p");
      appendInlineMarkdown(paragraph, quoteMatch[1]);
      quote.append(paragraph);
      container.append(quote);
      continue;
    }

    const unorderedMatch = trimmed.match(/^[-*+]\s+(.*)$/);
    const orderedMatch = trimmed.match(/^\d+\.\s+(.*)$/);
    if (unorderedMatch || orderedMatch) {
      flushParagraph();
      const listType = unorderedMatch ? "ul" : "ol";
      if (!currentList || currentList.tagName.toLowerCase() !== listType) {
        flushList();
        currentList = document.createElement(listType);
      }
      const item = document.createElement("li");
      appendInlineMarkdown(item, (unorderedMatch || orderedMatch)[1]);
      currentList.append(item);
      continue;
    }

    paragraphLines.push(trimmed);
  }

  flushParagraph();
  flushList();
  if (codeFenceLines) appendMarkdownCodeBlock(container, codeFenceLines.join("\n"), codeFenceLanguage);
}

function createRigSkillsController({
  initialVisible = false,
  isRunActive = () => false,
  onReloadSkills = () => {},
  onLog = () => {},
} = {}) {
  let rigSkills = [];
  let activeRigSkillId = null;
  let rigSkillsSearchTerm = "";
  let skillEditorMode = "preview";

  const toggleButton = element("button", {
    className: "explorer-toggle skills-toggle",
    text: "☷",
    attrs: {
      type: "button",
      title: initialVisible ? "Hide skills" : "Show skills",
      "aria-label": initialVisible ? "Hide skills" : "Show skills",
      "aria-pressed": String(initialVisible),
    },
  });

  const skillsCount = element("span", { text: "0 skills" });
  const skillsSearchInput = element("input", {
    className: "rig-skills-search",
    attrs: {
      type: "search",
      placeholder: "Search skills",
      "aria-label": "Search skills",
      autocomplete: "off",
      spellcheck: "false",
    },
  });
  const skillsList = element("div", {
    className: "rig-skills-list",
    children: [element("p", { className: "conversation-history-empty", text: "No skills loaded yet." })],
  });
  const skillsStatus = element("p", {
    className: "rig-skills-status",
    text: DEFAULT_RIG_SKILLS_STATUS,
  });
  const applySkillsButton = element("button", {
    className: "tool-selection-save",
    text: "Apply skills",
    attrs: { type: "button" },
  });
  const panel = element("aside", {
    className: "rig-skills",
    attrs: { "aria-labelledby": "skillsWindowTitle" },
    children: [
      element("header", { children: [
        element("div", { children: [
          element("h2", { text: "Skills", attrs: { id: "skillsWindowTitle" } }),
          skillsCount,
        ] }),
        element("button", {
          className: "conversation-history-create rig-skills-create",
          attrs: {
            type: "button",
            title: "Create skill",
            "aria-label": "Create skill",
          },
          children: [element("span", { text: "+", attrs: { "aria-hidden": "true" } })],
        }),
      ] }),
      element("div", { className: "rig-skills-search-wrap", children: [skillsSearchInput] }),
      skillsList,
      element("footer", { className: "rig-skills-footer", children: [skillsStatus, applySkillsButton] }),
    ],
  });
  const createSkillButton = panel.querySelector(".rig-skills-create");

  const skillEditorTitle = element("h2", { text: "Edit Skill", attrs: { id: "skillEditorModalTitle" } });
  const skillEditorPath = element("p", { className: "skill-editor-path" });
  const closeSkillEditorButton = element("button", {
    className: "step-prompt-modal-close",
    text: "×",
    attrs: { type: "button", "aria-label": "Close skill editor" },
  });
  const toggleSkillEditorModeButton = element("button", {
    className: "skill-editor-toggle step-prompt-save",
    text: "Edit",
    attrs: { type: "button" },
  });
  const skillEditorPreview = element("div", { className: "skill-markdown-preview" });
  const skillEditorContent = element("textarea", {
    className: "skill-editor-textarea",
    attrs: { "aria-label": "Skill markdown", spellcheck: "false" },
  });
  const skillEditorStatus = element("p", {
    className: "skill-editor-status",
    text: "Viewing the rendered markdown preview.",
  });
  const saveSkillEditorButton = element("button", {
    className: "step-prompt-save",
    text: "Save skill",
    attrs: { type: "button" },
  });
  const skillEditorPreviewPane = element("section", {
    className: "fileEditorPreview skill-editor-preview-pane",
    children: [skillEditorPreview],
  });
  const skillEditorInputPane = element("section", {
    className: "skill-editor-input-pane",
    children: [skillEditorContent],
  });
  const skillEditorModal = element("dialog", {
    className: "step-prompt-modal skill-editor-modal",
    attrs: { "aria-labelledby": "skillEditorModalTitle" },
    children: [element("section", { className: "step-prompt-modal-panel skill-editor-panel", children: [
      element("header", { children: [
        element("div", { className: "skill-editor-header-copy", children: [skillEditorTitle, skillEditorPath] }),
        element("div", { className: "skill-editor-header-actions", children: [toggleSkillEditorModeButton, closeSkillEditorButton] }),
      ] }),
      element("div", { className: "skill-editor-workbench", children: [
        skillEditorPreviewPane,
        skillEditorInputPane,
      ] }),
      element("div", { className: "step-prompt-actions skill-editor-actions", children: [skillEditorStatus, saveSkillEditorButton] }),
    ] })],
  });

  const createSkillNameInput = element("input", {
    attrs: {
      type: "text",
      placeholder: "Skill name",
      "aria-label": "Skill name",
      autocomplete: "off",
    },
  });
  const createSkillContentInput = element("textarea", {
    className: "skill-editor-textarea create-skill-textarea",
    attrs: {
      "aria-label": "Skill markdown content",
      spellcheck: "false",
      placeholder: "# My Skill\n\nDescribe when this skill should be used.",
    },
  });
  const createSkillStatus = element("p", {
    className: "skill-editor-status",
    text: "Create a new local SKILL.md guide under ~/.codex/skills.",
  });
  const closeCreateSkillButton = element("button", {
    className: "step-prompt-modal-close",
    text: "×",
    attrs: { type: "button", "aria-label": "Close create skill" },
  });
  const saveCreateSkillButton = element("button", {
    className: "step-prompt-save",
    text: "Create skill",
    attrs: { type: "button" },
  });
  const createSkillModal = element("dialog", {
    className: "step-prompt-modal create-skill-modal",
    attrs: { "aria-labelledby": "createSkillModalTitle" },
    children: [element("section", { className: "step-prompt-modal-panel create-skill-panel", children: [
      element("header", { children: [
        element("div", { children: [
          element("h2", { text: "New Skill", attrs: { id: "createSkillModalTitle" } }),
          element("p", { text: "Create a new local SKILL.md file and add it to the skills rail." }),
        ] }),
        closeCreateSkillButton,
      ] }),
      element("div", { className: "model-config-fields create-skill-fields", children: [
        element("label", { children: [element("span", { text: "Skill Name" }), createSkillNameInput] }),
      ] }),
      createSkillContentInput,
      element("div", { className: "step-prompt-actions skill-editor-actions", children: [createSkillStatus, saveCreateSkillButton] }),
    ] })],
  });

  function setVisible(visible) {
    toggleButton.setAttribute("aria-pressed", String(visible));
    toggleButton.title = visible ? "Hide skills" : "Show skills";
    toggleButton.setAttribute("aria-label", toggleButton.title);
  }

  function setError(message) {
    skillsStatus.textContent = message;
  }

  function setDefaultStatus() {
    skillsStatus.textContent = DEFAULT_RIG_SKILLS_STATUS;
  }

  function skillMatchesSearch(skill, searchTerm) {
    if (!searchTerm) return true;
    const haystack = [
      skill.name,
      skill.content,
      skill.sourcePath,
    ].join("\n").toLowerCase();
    return haystack.includes(searchTerm);
  }

  function setSkillEditorMode(mode = "preview") {
    skillEditorMode = mode === "edit" ? "edit" : "preview";
    const editing = skillEditorMode === "edit";
    skillEditorModal.classList.toggle("skill-editor-editing", editing);
    skillEditorPreviewPane.hidden = editing;
    skillEditorInputPane.hidden = !editing;
    saveSkillEditorButton.hidden = !editing;
    toggleSkillEditorModeButton.textContent = editing ? "Preview" : "Edit";
    toggleSkillEditorModeButton.setAttribute("aria-label", editing ? "Show markdown preview" : "Edit markdown source");
    skillEditorStatus.textContent = editing
      ? "Editing the raw SKILL.md source."
      : "Viewing the rendered markdown preview.";
    if (editing) {
      requestAnimationFrame(() => skillEditorContent.focus());
    } else {
      renderSkillMarkdown(skillEditorPreview, skillEditorContent.value);
    }
  }

  async function createSkill() {
    if (isRunActive()) throw new Error("Wait for the current run to finish before creating skills.");
    const name = createSkillNameInput.value.trim();
    if (!name) throw new Error("Skill name is required.");
    saveCreateSkillButton.disabled = true;
    createSkillStatus.textContent = "Creating skill…";
    try {
      const response = await persistCreatedSkill(name, createSkillContentInput.value);
      rigSkills = Array.isArray(response.skills) ? response.skills : rigSkills;
      renderRigSkills();
      setDefaultStatus();
      onReloadSkills();
      createSkillModal.close();
      openRigSkillEditor(response.skill?.id);
      onLog(`Created ${response.skill?.name || name}`);
    } finally {
      saveCreateSkillButton.disabled = false;
    }
  }

  function openRigSkillEditor(skillId) {
    const skill = rigSkills.find((entry) => entry.id === skillId);
    if (!skill) return;
    activeRigSkillId = skill.id;
    skillEditorTitle.textContent = skill.name;
    skillEditorPath.textContent = summarizeRigSkillSource(skill.sourcePath);
    skillEditorContent.value = skill.content;
    renderSkillMarkdown(skillEditorPreview, skill.content);
    saveSkillEditorButton.disabled = false;
    setSkillEditorMode("preview");
    showTransientDialog(skillEditorModal);
  }

  async function saveRigSkillEdit() {
    if (!activeRigSkillId) return;
    if (isRunActive()) throw new Error("Wait for the current run to finish before editing skills.");
    saveSkillEditorButton.disabled = true;
    skillEditorStatus.textContent = "Saving skill…";
    try {
      const response = await persistSkillContent(activeRigSkillId, skillEditorContent.value);
      rigSkills = Array.isArray(response.skills) ? response.skills : rigSkills;
      renderRigSkills();
      onReloadSkills();
      skillsStatus.textContent = `Saved ${response.skill?.name || "skill"} and reloaded agent context.`;
      onLog(`Updated ${response.skill?.name || activeRigSkillId}`);
      skillEditorModal.close();
    } catch (error) {
      skillEditorStatus.textContent = error.message;
      saveSkillEditorButton.disabled = false;
      throw error;
    }
  }

  function renderRigSkills() {
    skillsList.replaceChildren();
    if (!rigSkills.length) {
      skillsList.append(element("p", {
        className: "conversation-history-empty",
        text: "No SKILL.md files were discovered under ~/.codex.",
      }));
      skillsCount.textContent = "0 skills";
      applySkillsButton.disabled = true;
      return;
    }
    const filteredSkills = rigSkills.filter((skill) => skillMatchesSearch(skill, rigSkillsSearchTerm));
    if (!filteredSkills.length) {
      skillsList.append(element("p", {
        className: "conversation-history-empty",
        text: "No skills match the current search.",
      }));
      skillsCount.textContent = rigSkillsSearchTerm
        ? `0 of ${rigSkills.length} skills`
        : `${rigSkills.length} skill${rigSkills.length === 1 ? "" : "s"}`;
      applySkillsButton.disabled = false;
      return;
    }
    const fragment = document.createDocumentFragment();
    filteredSkills.forEach((skill) => {
      const checkbox = element("input", {
        attrs: {
          type: "checkbox",
          "data-skill-id": skill.id,
          "aria-label": `Enable skill ${skill.name}`,
        },
      });
      checkbox.checked = skill.selected === true;
      const openButton = element("button", {
        className: "rig-skill-open",
        attrs: {
          type: "button",
          "aria-label": `Edit skill ${skill.name}`,
        },
        children: [
          element("span", { className: "rig-skill-copy", children: [
            element("strong", { text: skill.name }),
            element("small", { text: summarizeRigSkillContent(skill.content) }),
            element("code", { text: summarizeRigSkillSource(skill.sourcePath) }),
          ] }),
        ],
      });
      openButton.addEventListener("click", () => openRigSkillEditor(skill.id));
      fragment.append(element("div", {
        className: "rig-skill-row",
        children: [openButton, checkbox],
      }));
    });
    skillsList.append(fragment);
    skillsCount.textContent = rigSkillsSearchTerm
      ? `${filteredSkills.length} of ${rigSkills.length} skills`
      : `${rigSkills.length} skill${rigSkills.length === 1 ? "" : "s"}`;
    applySkillsButton.disabled = false;
  }

  async function load() {
    skillsStatus.textContent = "Loading skills…";
    rigSkills = await fetchSkills();
    renderRigSkills();
    setDefaultStatus();
  }

  async function applyRigSkillsSelection() {
    if (isRunActive()) throw new Error("Wait for the current run to finish before changing skills.");
    const selectedSkillIds = [...skillsList.querySelectorAll("[data-skill-id]:checked")]
      .map((input) => input.dataset.skillId);
    skillsStatus.textContent = "Applying skill selection…";
    applySkillsButton.disabled = true;
    try {
      const response = await persistSelectedSkills(selectedSkillIds);
      const selected = new Set((response.skills || []).map((skill) => skill.id));
      rigSkills = rigSkills.map((skill) => ({ ...skill, selected: selected.has(skill.id) }));
      renderRigSkills();
      onReloadSkills();
      skillsStatus.textContent = `${selectedSkillIds.length} skill${selectedSkillIds.length === 1 ? "" : "s"} applied.`;
      onLog(`${selectedSkillIds.length} skill${selectedSkillIds.length === 1 ? "" : "s"} selected`);
    } finally {
      applySkillsButton.disabled = false;
    }
  }

  skillsSearchInput.addEventListener("input", () => {
    rigSkillsSearchTerm = skillsSearchInput.value.trim().toLowerCase();
    renderRigSkills();
  });
  applySkillsButton.addEventListener("click", () => {
    applyRigSkillsSelection().catch((error) => {
      skillsStatus.textContent = error.message;
      onLog(error.message, "log-error");
    });
  });
  createSkillButton.addEventListener("click", () => {
    createSkillNameInput.value = "";
    createSkillContentInput.value = "";
    createSkillStatus.textContent = "Create a new local SKILL.md guide under ~/.codex/skills.";
    saveCreateSkillButton.disabled = false;
    showTransientDialog(createSkillModal);
    requestAnimationFrame(() => createSkillNameInput.focus());
  });
  skillEditorContent.addEventListener("input", () => renderSkillMarkdown(skillEditorPreview, skillEditorContent.value));
  toggleSkillEditorModeButton.addEventListener("click", () => {
    setSkillEditorMode(skillEditorMode === "edit" ? "preview" : "edit");
  });
  closeCreateSkillButton.addEventListener("click", () => createSkillModal.close());
  createSkillModal.addEventListener("click", (event) => {
    if (event.target === createSkillModal) createSkillModal.close();
  });
  saveCreateSkillButton.addEventListener("click", async () => {
    try {
      await createSkill();
    } catch (error) {
      createSkillStatus.textContent = error.message;
      saveCreateSkillButton.disabled = false;
      onLog(error.message, "log-error");
    }
  });
  closeSkillEditorButton.addEventListener("click", () => skillEditorModal.close());
  skillEditorModal.addEventListener("click", (event) => {
    if (event.target === skillEditorModal) skillEditorModal.close();
  });
  skillEditorModal.addEventListener("close", () => {
    activeRigSkillId = null;
    saveSkillEditorButton.disabled = false;
    setSkillEditorMode("preview");
  });
  saveSkillEditorButton.addEventListener("click", async () => {
    try {
      await saveRigSkillEdit();
    } catch (error) {
      skillEditorStatus.textContent = error.message;
      saveSkillEditorButton.disabled = false;
      onLog(error.message, "log-error");
    }
  });

  return {
    panel,
    toggleButton,
    load,
    setVisible,
    setError,
  };
}

export { createRigSkillsController, DEFAULT_RIG_SKILLS_STATUS };
