import { bootstrapIcon } from "../../lib/icons.js";
import BaseComponent from "../base-component.js";

const TOOL_ROWS = [
  ["List files", "List files and folders inside the workspace.", "list_files"],
  ["Search files", "Search workspace text files with a regular expression.", "search_files"],
  ["Read files", "Read selected UTF-8 file contents from the workspace.", "read_file"],
  ["Exact edits", "Unique replacements across files with durable recovery.", "edit_files"],
  ["Change history", "Review, undo, and redo tracked file changes.", "change_history"],
  ["JavaScript tools", "Node syntax checks, import hints, and lexical symbol/reference lookup.", "javascript"],
  ["Write files", "Create or replace UTF-8 files inside the workspace.", "write_file"],
  ["Curl", "Fetch HTTP or HTTPS URLs for API and web inspection.", "curl"],
  ["Run commands", "Run shell commands in the workspace.", "run_command"],
  ["Chrome DevTools", "Browse pages, inspect source, run JavaScript, and save screenshots.", "chrome_devtools"],
  ["Sub-agent delegation", "Delegate self-contained tasks to configured asynchronous Agent Workers.", "delegate_to_sub_agent"],
];

class ToolsModal extends BaseComponent {
  connectedCallback() {
    if (this.childElementCount) return;
    this.style.display = "contents";
    this.render();
  }

  runtimeSection() {
    return this.createElement('section', { class: 'runtimeSettings', children: [
      this.createElement('h3', { textContent: 'Global runtime settings' }),
      this.createElement('p', { textContent: 'Applies to all presets, browser and CLI. Last matching rule wins. * matches any text. Paths are workspace-relative; commands match the entire shell string. These rules do not sandbox shell or MCP processes.' }),
      this.createElement('label', { textContent: 'Default permission', children: [this.createElement('select', { id: 'runtimePermissionDefault', children: ['allow', 'ask', 'deny'].map((value) => this.createElement('option', { value, textContent: value })) })] }),
      this.createElement('label', { textContent: 'Ordered permission rules (JSON)', children: [this.createElement('textarea', { id: 'runtimePermissionRules', rows: '7', spellcheck: 'false', placeholder: '[{"tool":"write_file","pattern":"src/*","action":"ask"}]' })] }),
      this.createElement('p', { textContent: 'Examples: read_file / .env* / deny; edit_files / src/* / ask; run_command / * / ask; javascript / * / allow. Recovery also checks write_file for every restored path. MCP rules use the discovered tool name.' }),
      this.createElement('label', { textContent: 'Automatic context compaction', children: [this.createElement('input', { id: 'runtimeContextEnabled', type: 'checkbox' })] }),
      ...[['runtimeContextMax', 'Context window (estimated tokens)', 8000, 1000000], ['runtimeContextReserve', 'Reserve for response (tokens)', 1000, 499999], ['runtimeContextRecent', 'Recent turns to keep verbatim', 1, 20]].map(([id, label, min, max]) => this.createElement('label', { textContent: label, children: [this.createElement('input', { id, type: 'number', min: String(min), max: String(max), required: '' })] })),
      this.createElement('p', { textContent: 'Set the window to your model’s supported context size. Estimates are approximate. Summaries make an additional model request; compaction preserves recent structured tool calls and results.' }),
      this.createElement('label', { textContent: 'Check JavaScript syntax and imports after tracked edits', children: [this.createElement('input', { id: 'runtimeJavaScriptCheck', type: 'checkbox' })] }),
      this.createElement('h3', { textContent: 'JavaScript and Node.js inspection' }),
      this.createElement('label', { textContent: 'Workspace file or directory', children: [this.createElement('input', { id: 'javascriptPath', value: '.' })] }),
      this.createElement('label', { textContent: 'Inspection', children: [this.createElement('select', { id: 'javascriptAction', children: ['diagnostics', 'symbols', 'references'].map((value) => this.createElement('option', { value, textContent: value })) })] }),
      this.createElement('label', { textContent: 'Identifier (required for references)', children: [this.createElement('input', { id: 'javascriptQuery', placeholder: 'e.g. handleRequest' })] }),
      this.createElement('button', { id: 'inspectJavaScript', type: 'button', textContent: 'Inspect JavaScript' }),
      this.createElement('pre', { id: 'javascriptResults', tabindex: '0' }),
      this.createElement('h3', { textContent: 'Workspace change recovery' }),
      this.createElement('p', { textContent: 'Tracks built-in writes and exact edits, including changes before a restart. Shell, MCP, and manual editor writes are not tracked. Recovery refuses to overwrite later changes.' }),
      this.createElement('button', { id: 'loadChangeHistory', type: 'button', textContent: 'Load workspace changes' }),
      this.createElement('div', { id: 'changeHistoryList' }),
      this.createElement('pre', { id: 'changeHistoryPreview', tabindex: '0' }),
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
    const toolRows = TOOL_ROWS.map(([name, description, permission]) => this.createElement("tr", {
      children: [
        this.createElement("th", { scope: "row", children: [document.createTextNode(name)] }),
        this.createElement("td", { children: [document.createTextNode(description)] }),
        this.createElement("td", { children: [this.createElement("input", {
          type: "checkbox",
          "data-tool-permission": permission,
          "aria-label": `Enable ${name}`,
        })] }),
      ],
    }));

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
              this.createElement("div", {
                class: "toolTableWrap",
                children: [this.createElement("table", {
                  class: "toolTable",
                  children: [
                    this.createElement("thead", { children: [this.createElement("tr", { children: [
                      this.createElement("th", { scope: "col", children: [document.createTextNode("Tool")] }),
                      this.createElement("th", { scope: "col", children: [document.createTextNode("Description")] }),
                      this.createElement("th", { scope: "col", children: [document.createTextNode("Enabled")] }),
                    ] })] }),
                    this.createElement("tbody", { children: toolRows }),
                  ],
                })],
              }),
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
    this.querySelector("form").addEventListener("submit", (event) => {
      event.preventDefault();
      this.emit("save-tool-permissions");
    });
  }
}

customElements.define("tools-modal", ToolsModal);

export default ToolsModal;
