import { bootstrapIcon } from "../../lib/icons.js";
import BaseComponent from "../base-component.js";

const TOOL_ROWS = [
  ["List files", "List files and folders inside the workspace.", "list_files"],
  ["Search files", "Search workspace text files with a regular expression.", "search_files"],
  ["Read files", "Read selected UTF-8 file contents from the workspace.", "read_file"],
  ["Search skills", "Find skill guides by name and description without loading them.", "search_skills"],
  ["Read skill resource", "Load a relevant SKILL.md guide or its supporting files.", "read_skill_resource"],
  ["Exact edits", "Unique replacements across files with durable recovery.", "edit_files"],
  ["Change history", "Review, undo, and redo tracked file changes.", "change_history"],
  ["JavaScript tools", "Node syntax checks, import hints, and lexical symbol/reference lookup.", "javascript"],
  ["Write files", "Create or replace UTF-8 files inside the workspace.", "write_file"],
  ["Curl", "Fetch HTTP or HTTPS URLs for API and web inspection.", "curl"],
  ["Run commands", "Run shell commands in the workspace.", "run_command"],
  ["Chrome DevTools", "Browse pages, inspect source, run JavaScript, and save screenshots.", "chrome_devtools"],
  ["Sub-agent delegation", "Delegate self-contained tasks to configured asynchronous Agent Workers.", "delegate_to_sub_agent"],
];

const TOOL_GROUPS = [
  ["file-access", "File access", ["list_files", "search_files", "read_file", "write_file", "edit_files", "change_history"]],
  ["code-inspection", "Code and skills", ["javascript", "search_skills", "read_skill_resource"]],
  ["web-access", "Web access", ["curl", "chrome_devtools"]],
  ["execution", "Execution and delegation", ["run_command", "delegate_to_sub_agent"]],
];
const TOOL_TREE_STORAGE_KEY = "ai-harness.toolsCollapsedGroups";

class ToolsModal extends BaseComponent {
  connectedCallback() {
    if (this.childElementCount) return;
    this.style.display = "contents";
    this.render();
  }

  runtimeSection() {
    return this.createElement('section', { class: 'runtimeSettings', children: [
      this.createElement('div', { class: 'runtimeHeading', children: [
        this.createElement('h3', { textContent: 'Global runtime settings' }),
        this.createElement('p', { textContent: 'Shared by every preset in the browser and CLI.' }),
      ] }),
      this.createElement('div', { class: 'runtimeGrid', children: [
        this.createElement('section', { class: 'runtimeCard runtimeCardWide', children: [
          this.createElement('h4', { textContent: 'Permission policy' }),
          this.createElement('p', { textContent: 'Choose a default, then add exceptions. The last matching rule wins.' }),
          this.createElement('label', { textContent: 'Default permission', children: [this.createElement('select', { id: 'runtimePermissionDefault', children: ['allow', 'ask', 'deny'].map((value) => this.createElement('option', { value, textContent: value })) })] }),
          this.createElement('label', { class: 'runtimeStackedField', textContent: 'Ordered rules (JSON)', children: [this.createElement('textarea', { id: 'runtimePermissionRules', rows: '7', spellcheck: 'false', placeholder: '[{"tool":"write_file","pattern":"src/*","action":"ask"}]' })] }),
          this.createElement('p', { class: 'runtimeHelp', textContent: 'Use * to match any text. Paths are workspace-relative; commands match the full shell string. For example: read_file / .env* / deny. Rules do not sandbox shell or MCP processes.' }),
        ] }),
        this.createElement('section', { class: 'runtimeCard', children: [
          this.createElement('h4', { textContent: 'Context management' }),
          this.createElement('p', { textContent: 'Keep long conversations within the model’s context window.' }),
          this.createElement('label', { textContent: 'Automatic compaction', children: [this.createElement('input', { id: 'runtimeContextEnabled', type: 'checkbox' })] }),
          ...[['runtimeContextMax', 'Context window (tokens)', 8000, 1000000], ['runtimeContextReserve', 'Response reserve (tokens)', 1000, 499999], ['runtimeContextRecent', 'Recent turns to retain', 1, 20]].map(([id, label, min, max]) => this.createElement('label', { textContent: label, children: [this.createElement('input', { id, type: 'number', min: String(min), max: String(max), required: '' })] })),
          this.createElement('p', { class: 'runtimeHelp', textContent: 'Token counts are estimates. Summaries require another model request.' }),
        ] }),
        this.createElement('section', { class: 'runtimeCard', children: [
          this.createElement('h4', { textContent: 'JavaScript inspection' }),
          this.createElement('p', { textContent: 'Check code automatically or inspect a workspace path on demand.' }),
          this.createElement('label', { textContent: 'Check after tracked edits', children: [this.createElement('input', { id: 'runtimeJavaScriptCheck', type: 'checkbox' })] }),
          this.createElement('label', { textContent: 'File or directory', children: [this.createElement('input', { id: 'javascriptPath', value: '.' })] }),
          this.createElement('label', { textContent: 'Inspection', children: [this.createElement('select', { id: 'javascriptAction', children: ['diagnostics', 'symbols', 'references'].map((value) => this.createElement('option', { value, textContent: value })) })] }),
          this.createElement('label', { textContent: 'Identifier for references', children: [this.createElement('input', { id: 'javascriptQuery', placeholder: 'e.g. handleRequest' })] }),
          this.createElement('button', { id: 'inspectJavaScript', type: 'button', textContent: 'Inspect JavaScript' }),
          this.createElement('pre', { id: 'javascriptResults', tabindex: '0' }),
        ] }),
        this.createElement('section', { class: 'runtimeCard runtimeCardWide', children: [
          this.createElement('h4', { textContent: 'Workspace change recovery' }),
          this.createElement('p', { textContent: 'Review, undo, or redo tracked writes and exact edits. Recovery checks for later changes before overwriting files.' }),
          this.createElement('button', { id: 'loadChangeHistory', type: 'button', textContent: 'Load workspace changes' }),
          this.createElement('div', { id: 'changeHistoryList' }),
          this.createElement('pre', { id: 'changeHistoryPreview', tabindex: '0' }),
          this.createElement('p', { class: 'runtimeHelp', textContent: 'Shell, MCP, and manual editor writes are not tracked.' }),
        ] }),
      ] }),
    ] });
  }

  async loadRuntimeSettings() {
    const response = await fetch('/api/runtime-settings');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    const value = data.settings;
    this.querySelector('#runtimePermissionDefault').value = value.permissions.default;
    this.querySelector('#runtimePermissionRules').value = JSON.stringify(value.permissions.rules, null, 2);
    this.querySelector('#runtimeContextEnabled').checked = value.context.enabled;
    this.querySelector('#runtimeContextMax').value = value.context.maxTokens;
    this.querySelector('#runtimeContextReserve').value = value.context.reserveTokens;
    this.querySelector('#runtimeContextRecent').value = value.context.keepRecent;
    this.querySelector('#runtimeJavaScriptCheck').checked = value.javascript.checkAfterEdit;
  }

  async saveRuntimeSettings() {
    const value = {
      permissions: { default: this.querySelector('#runtimePermissionDefault').value, rules: JSON.parse(this.querySelector('#runtimePermissionRules').value) },
      context: { enabled: this.querySelector('#runtimeContextEnabled').checked, maxTokens: Number(this.querySelector('#runtimeContextMax').value), reserveTokens: Number(this.querySelector('#runtimeContextReserve').value), keepRecent: Number(this.querySelector('#runtimeContextRecent').value) },
      javascript: { checkAfterEdit: this.querySelector('#runtimeJavaScriptCheck').checked },
    };
    const response = await fetch('/api/runtime-settings', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
  }

  render() {
    let collapsedGroups = [];
    try { collapsedGroups = JSON.parse(localStorage.getItem(TOOL_TREE_STORAGE_KEY) || "[]"); } catch { /* Use expanded groups. */ }
    if (!Array.isArray(collapsedGroups)) collapsedGroups = [];
    const toolGroups = TOOL_GROUPS.map(([id, name, permissions]) => {
      const children = TOOL_ROWS.filter((row) => permissions.includes(row[2])).map(([label, description, permission]) =>
        this.createElement("label", { class: "toolTreeItem", children: [
          this.createElement("input", { type: "checkbox", "data-tool-permission": permission }),
          this.createElement("span", { class: "toolTreeItemText", children: [
            this.createElement("strong", { textContent: label }),
            this.createElement("small", { textContent: description }),
          ] }),
        ] }));
      return this.createElement("div", { class: "toolTreeGroup", "data-tool-group": id, children: [
        this.createElement("div", { class: "toolTreeGroupHeader", children: [
          this.createElement("button", { type: "button", class: "toolTreeDisclosure", "aria-label": `${collapsedGroups.includes(id) ? "Expand" : "Collapse"} ${name}`, "aria-expanded": String(!collapsedGroups.includes(id)), "aria-controls": `tool-group-${id}`, textContent: collapsedGroups.includes(id) ? "▸" : "▾" }),
          this.createElement("label", { class: "toolTreeGroupLabel", children: [
            this.createElement("input", { type: "checkbox", "data-tool-group-toggle": id }),
            this.createElement("span", { textContent: name }),
          ] }),
        ] }),
        this.createElement("div", { id: `tool-group-${id}`, class: "toolTreeChildren", ...(collapsedGroups.includes(id) ? { hidden: "" } : {}), children }),
      ] });
    });

    const dialog = this.createElement("dialog", {
      id: "toolsDialog",
      class: "settingsDialog",
      children: [this.createElement("form", {
        id: "toolsForm",
        class: "settingsPanel",
        method: "dialog",
        children: [
          this.createElement("header", {
            class: "settingsHeader",
            children: [
              this.createElement("div", { children: [
                this.createElement("h2", { children: [document.createTextNode("Tools")] }),
                this.createElement("p", { children: [document.createTextNode("Choose enabled tools; global permission rules apply before execution")] }),
              ] }),
              this.createElement("button", {
                id: "closeToolsButton",
                class: "iconButton",
                type: "button",
                "aria-label": "Close tools",
                children: [bootstrapIcon("x-lg")],
              }),
            ],
          }),
          this.createElement("section", {
            class: "toolPermissions",
            "aria-label": "Local tool permissions",
            children: [
              this.createElement("div", { class: "toolTree", children: toolGroups }),
            ],
          }),
          this.runtimeSection(),
          this.createElement("footer", {
            class: "settingsFooter",
            children: [
              this.createElement("span", {
                id: "toolPermissionsStatus",
                class: "configStatus",
                children: [document.createTextNode("Tool permissions are stored in the active preset.")],
              }),
              this.createElement("div", { children: [this.createElement("button", {
                id: "saveToolPermissionsButton",
                class: "primaryButton",
                type: "submit",
                children: [document.createTextNode("Save tools")],
              })] }),
            ],
          }),
        ],
      })],
    });

    this.appendChildren(this, [dialog]);
    this.querySelector("#inspectJavaScript").addEventListener("click", () => this.emit("inspect-javascript"));
    this.querySelector("#loadChangeHistory").addEventListener("click", () => this.emit("load-change-history"));
    this.querySelector("#closeToolsButton").addEventListener("click", () => dialog.close());
    this.querySelectorAll("[data-tool-group]").forEach((group) => {
      const parent = group.querySelector("[data-tool-group-toggle]");
      const children = [...group.querySelectorAll("[data-tool-permission]")];
      parent.addEventListener("change", () => {
        children.forEach((input) => { input.checked = parent.checked; });
        parent.indeterminate = false;
      });
      children.forEach((input) => input.addEventListener("change", () => this.syncToolGroupChecks()));
      const disclosure = group.querySelector(".toolTreeDisclosure");
      const childList = group.querySelector(".toolTreeChildren");
      disclosure.addEventListener("click", () => {
        childList.hidden = !childList.hidden;
        disclosure.setAttribute("aria-expanded", String(!childList.hidden));
        disclosure.setAttribute("aria-label", `${childList.hidden ? "Expand" : "Collapse"} ${group.querySelector(".toolTreeGroupLabel span").textContent}`);
        disclosure.textContent = childList.hidden ? "▸" : "▾";
        const collapsed = [...this.querySelectorAll("[data-tool-group]")]
          .filter((item) => item.querySelector(".toolTreeChildren").hidden)
          .map((item) => item.dataset.toolGroup);
        try { localStorage.setItem(TOOL_TREE_STORAGE_KEY, JSON.stringify(collapsed)); } catch { /* Storage may be unavailable. */ }
      });
    });
    this.querySelector("form").addEventListener("submit", (event) => {
      event.preventDefault();
      this.emit("save-tool-permissions");
    });
  }

  syncToolGroupChecks() {
    this.querySelectorAll("[data-tool-group]").forEach((group) => {
      const parent = group.querySelector("[data-tool-group-toggle]");
      const children = [...group.querySelectorAll("[data-tool-permission]")];
      const checked = children.filter((input) => input.checked).length;
      parent.checked = checked === children.length;
      parent.indeterminate = checked > 0 && checked < children.length;
    });
  }
}

customElements.define("tools-modal", ToolsModal);

export default ToolsModal;
