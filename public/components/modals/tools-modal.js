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
  selectTab(name, { focus = false, updateRoute = false } = {}) {
    for (const button of this.querySelectorAll('[data-tools-tab]')) {
      const active = button.dataset.toolsTab === name;
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
      if (active && focus) button.focus();
    }
    for (const panel of this.querySelectorAll('[data-tools-panel]')) panel.hidden = panel.dataset.toolsPanel !== name;
    const save = this.querySelector('#saveToolPermissionsButton');
    save.hidden = !['permissions', 'runtime'].includes(name);
    save.textContent = name === 'runtime' ? 'Save runtime settings' : 'Save permissions';
    if (updateRoute) this.emit('tools-tab-change', { tab: name });
  }

  renderToolFiles(tools) {
    const list = this.querySelector('#toolFilesList');
    list.replaceChildren(...tools.map((tool) => this.createElement('li', { class: 'toolFileItem', children: [
      this.createElement('div', { children: [
        this.createElement('strong', { textContent: tool.title }),
        this.createElement('small', { textContent: `${tool.name} · ${tool.kind}` }),
      ] }),
      this.createElement('button', { type: 'button', class: 'iconButton', title: `Edit ${tool.title}`, 'aria-label': `Edit ${tool.title}`, children: [bootstrapIcon('pencil-square')] }),
    ] })));
    [...list.children].forEach((item, index) => item.querySelector('button').addEventListener('click', () => this.showToolEditor(tools[index]).catch((error) => { this.querySelector('#toolEditorStatus').textContent = error.message; })));
  }

  async runSystemTest() {
    this.selectTab('test', { updateRoute: true });
    const button = this.querySelector('#testAllTools');
    const panel = this.querySelector('#toolSystemTestResults');
    const summary = this.querySelector('#toolSystemTestSummary');
    const list = this.querySelector('#toolSystemTestList');
    panel.hidden = false;
    button.disabled = true;
    summary.textContent = 'Testing tools in a temporary workspace…';
    list.replaceChildren();
    try {
      const response = await fetch('/api/tools', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'system-test' }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to test tools.');
      const report = payload.report;
      summary.textContent = `${report.passed} passed · ${report.failed} failed · ${report.limited} limited`;
      list.replaceChildren(...report.results.map((item) => this.createElement('li', { class: `toolSystemTestResult ${item.status}`, children: [
        this.createElement('strong', { textContent: item.title || item.name }),
        this.createElement('span', { class: 'toolSystemTestBadge', textContent: item.status }),
        this.createElement('small', { textContent: item.detail }),
      ] })));
    } catch (error) { summary.textContent = error.message; }
    finally { button.disabled = false; }
  }

  async loadToolDefinitions() {
    const response = await fetch('/api/tools');
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Unable to load tools.');
    this.tools = payload.tools;
    this.renderToolFiles(payload.tools);
    const tree = this.querySelector('.toolTree');
    tree.replaceChildren();
    const labels = new Map(TOOL_GROUPS.map(([id, label]) => [id, label]));
    let collapsed = [];
    try { collapsed = JSON.parse(localStorage.getItem(TOOL_TREE_STORAGE_KEY) || '[]'); } catch { /* Use defaults. */ }
    const groups = new Map();
    for (const tool of payload.tools) {
      const group = tool.group || 'custom';
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group).push(tool);
    }
    for (const [id, tools] of groups) {
      const name = labels.get(id) || id.replaceAll('-', ' ').replace(/^./, (letter) => letter.toUpperCase());
      const children = tools.map((tool) => this.createElement('div', { class: 'toolTreeItem', children: [
        this.createElement('input', { type: 'checkbox', 'data-tool-permission': tool.name, 'aria-label': `Enable ${tool.title}` }),
        this.createElement('span', { class: 'toolTreeItemText', children: [this.createElement('strong', { textContent: tool.title }), this.createElement('small', { textContent: tool.description })] }),
      ] }));
      const closed = Array.isArray(collapsed) && collapsed.includes(id);
      tree.append(this.createElement('div', { class: 'toolTreeGroup', 'data-tool-group': id, children: [
        this.createElement('div', { class: 'toolTreeGroupHeader', children: [
          this.createElement('button', { type: 'button', class: 'toolTreeDisclosure', 'aria-label': `${closed ? 'Expand' : 'Collapse'} ${name}`, 'aria-expanded': String(!closed), 'aria-controls': `tool-group-${id}`, textContent: closed ? '▸' : '▾' }),
          this.createElement('label', { class: 'toolTreeGroupLabel', children: [this.createElement('input', { type: 'checkbox', 'data-tool-group-toggle': id }), this.createElement('span', { textContent: name })] }),
        ] }),
        this.createElement('div', { id: `tool-group-${id}`, class: 'toolTreeChildren', ...(closed ? { hidden: '' } : {}), children }),
      ] }));
    }
    this.bindToolTree();
  }

  bindToolTree() {
    this.querySelectorAll('[data-tool-group]').forEach((group) => {
      const parent = group.querySelector('[data-tool-group-toggle]');
      const children = [...group.querySelectorAll('[data-tool-permission]')];
      parent.addEventListener('change', () => { children.forEach((input) => { input.checked = parent.checked; }); parent.indeterminate = false; });
      children.forEach((input) => input.addEventListener('change', () => this.syncToolGroupChecks()));
      const disclosure = group.querySelector('.toolTreeDisclosure');
      const childList = group.querySelector('.toolTreeChildren');
      disclosure.addEventListener('click', () => {
        childList.hidden = !childList.hidden;
        disclosure.setAttribute('aria-expanded', String(!childList.hidden));
        disclosure.textContent = childList.hidden ? '▸' : '▾';
        const collapsed = [...this.querySelectorAll('[data-tool-group]')].filter((item) => item.querySelector('.toolTreeChildren').hidden).map((item) => item.dataset.toolGroup);
        try { localStorage.setItem(TOOL_TREE_STORAGE_KEY, JSON.stringify(collapsed)); } catch { /* Storage may be unavailable. */ }
      });
    });
    this.syncToolGroupChecks();
  }

  async showToolEditor(tool = null, kind = 'command') {
    this.selectTab('files', { updateRoute: true });
    this.querySelector('#toolEditor').hidden = false;
    this.querySelector('#toolManifest').value = JSON.stringify(tool || (kind === 'module'
      ? { name: 'my_tool', kind: 'module', title: 'My tool', description: 'Describe what this tool does.', group: 'custom', entry: 'index.js' }
      : { name: 'my_tool', kind: 'command', title: 'My tool', description: 'Describe what this command does.', group: 'custom', command: 'node', args: ['script.js', '{{input}}'], timeoutMs: 10000 }), null, 2);
    this.querySelector('#toolEditor').dataset.mode = tool ? 'edit' : 'create';
    this.querySelector('#toolEditor').dataset.name = tool?.name || '';
    const source = this.querySelector('#toolSource');
    this.querySelector('#toolSourceLabel').textContent = `Module source (${tool?.entry || 'index.js'})`;
    source.value = '';
    source.hidden = !tool || tool.kind === 'command';
    this.querySelector('#toolSourceLabel').hidden = source.hidden;
    if (kind === 'module' && !tool) {
      source.hidden = false;
      this.querySelector('#toolSourceLabel').hidden = false;
      source.value = 'export function createTool(context) {\n  return {\n    name: "my_tool",\n    description: "Describe what this tool does.",\n    parameters: { type: "object", properties: {}, required: [] },\n    async execute(args) { return { ok: true }; },\n  };\n}\n';
    }
    if (tool && tool.kind !== 'command') {
      const response = await fetch(`/api/tools?${new URLSearchParams({ name: tool.name, resource: tool.entry })}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to load tool source.');
      source.value = payload.content;
    }
    this.querySelector('#toolManifest').focus();
  }

  async submitTool(action) {
    const editor = this.querySelector('#toolEditor');
    const content = this.querySelector('#toolManifest').value;
    const manifest = JSON.parse(content);
    if (editor.dataset.mode === 'edit' && manifest.name !== editor.dataset.name) throw new Error('Tool names cannot be changed while editing. Import a new manifest instead.');
    const source = manifest.kind === 'command' ? undefined : this.querySelector('#toolSource').value;
    const method = action === 'test' ? 'POST' : editor.dataset.mode === 'create' ? 'POST' : 'PUT';
    const response = await fetch('/api/tools', { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(action === 'test' ? { action, content, source } : { content }) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Unable to save tool.');
    if (action !== 'test' && source !== undefined) {
      const sourceResponse = await fetch('/api/tools', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: manifest.name, resource: manifest.entry, content: source }) });
      const sourceResult = await sourceResponse.json();
      if (!sourceResponse.ok) throw new Error(sourceResult.error || 'Unable to save tool source.');
    }
    this.querySelector('#toolEditorStatus').textContent = action === 'test' ? payload.report.message : `Saved ${payload.tool.name} to /tools/${payload.tool.name.replaceAll('_', '-')}/`;
    if (action !== 'test') { editor.hidden = true; await this.loadToolDefinitions(); this.emit('tool-definitions-changed'); }
  }

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
          this.createElement('nav', { class: 'toolsTabs', role: 'tablist', 'aria-label': 'Tools settings sections', children: [
            ...[['permissions', 'Permissions'], ['files', 'Tool files'], ['runtime', 'Runtime'], ['test', 'System test']].map(([name, label]) => this.createElement('button', {
              id: 'toolsTab' + name, type: 'button', role: 'tab', 'data-tools-tab': name,
              'aria-controls': 'toolsPanel' + name, 'aria-selected': String(name === 'permissions'),
              tabindex: name === 'permissions' ? '0' : '-1', textContent: label,
            })),
          ] }),
          this.createElement("section", {
            id: 'toolsPanelpermissions',
            class: "toolPermissions toolsTabPanel",
            role: 'tabpanel', 'data-tools-panel': 'permissions', 'aria-labelledby': 'toolsTabpermissions',
            "aria-label": "Local tool permissions",
            children: [
              this.createElement('p', { class: 'toolsPanelIntro', textContent: 'Choose which tools the active preset can use. Parent checkboxes select every child.' }),
              this.createElement("div", { class: "toolTree", children: toolGroups }),
            ],
          }),
          this.createElement('section', { id: 'toolsPanelfiles', class: 'toolsTabPanel', role: 'tabpanel', 'data-tools-panel': 'files', 'aria-labelledby': 'toolsTabfiles', hidden: '', children: [
              this.createElement('p', { class: 'toolsPanelIntro', textContent: 'Create, import, and edit tool folders under /tools.' }),
              this.createElement('div', { class: 'toolFileActions', children: [
                this.createElement('button', { id: 'createModuleTool', class: 'iconButton', type: 'button', title: 'New module tool', 'aria-label': 'New module tool', children: [bootstrapIcon('filetype-js')] }),
                this.createElement('button', { id: 'createTool', class: 'iconButton', type: 'button', title: 'New command tool', 'aria-label': 'New command tool', children: [bootstrapIcon('wrench')] }),
                this.createElement('button', { id: 'importTool', class: 'iconButton', type: 'button', title: 'Import TOOL.json', 'aria-label': 'Import TOOL.json', children: [bootstrapIcon('filetype-json')] }),
                this.createElement('input', { id: 'toolImportFile', type: 'file', accept: '.json,application/json', hidden: '' }),
                this.createElement('button', { id: 'importToolFolder', class: 'iconButton', type: 'button', title: 'Import tool folder', 'aria-label': 'Import tool folder', children: [bootstrapIcon('folder-plus')] }),
                this.createElement('input', { id: 'toolImportFolderFiles', type: 'file', webkitdirectory: '', multiple: '', hidden: '' }),
              ] }),
              this.createElement('ul', { id: 'toolFilesList', class: 'toolFilesList' }),
              this.createElement('section', { id: 'toolEditor', class: 'runtimeCard', hidden: '', children: [
                this.createElement('h3', { textContent: 'Tool manifest' }),
                this.createElement('p', { textContent: 'Edit TOOL.json. Command tools receive an input string through {{input}} in their arguments.' }),
                this.createElement('textarea', { id: 'toolManifest', rows: '12', spellcheck: 'false', 'aria-label': 'TOOL.json content' }),
                this.createElement('label', { id: 'toolSourceLabel', textContent: 'Module source (index.js)', hidden: '' }),
                this.createElement('textarea', { id: 'toolSource', rows: '16', spellcheck: 'false', 'aria-label': 'Tool module source', hidden: '' }),
                this.createElement('div', { class: 'toolFileActions', children: [
                  this.createElement('button', { id: 'testTool', type: 'button', textContent: 'Test manifest' }),
                  this.createElement('button', { id: 'saveTool', type: 'button', textContent: 'Save manifest' }),
                  this.createElement('button', { id: 'cancelTool', type: 'button', textContent: 'Cancel' }),
                ] }),
                this.createElement('p', { id: 'toolEditorStatus', role: 'status' }),
              ] }),
          ] }),
          this.createElement('section', { id: 'toolsPanelruntime', class: 'toolsTabPanel', role: 'tabpanel', 'data-tools-panel': 'runtime', 'aria-labelledby': 'toolsTabruntime', hidden: '', children: [this.runtimeSection()] }),
          this.createElement('section', { id: 'toolsPaneltest', class: 'toolsTabPanel', role: 'tabpanel', 'data-tools-panel': 'test', 'aria-labelledby': 'toolsTabtest', hidden: '', children: [
            this.createElement('p', { class: 'toolsPanelIntro', textContent: 'Run safe checks in a temporary workspace. Browser and worker integrations report their limits.' }),
            this.createElement('button', { id: 'testAllTools', type: 'button', class: 'toolSystemTestButton', children: [bootstrapIcon('check-lg'), this.createElement('span', { textContent: 'Test tools' })] }),
            this.createElement('section', { id: 'toolSystemTestResults', class: 'toolSystemTestResults', 'aria-label': 'Tool system test results', hidden: '', children: [
              this.createElement('h3', { textContent: 'System test' }),
              this.createElement('p', { id: 'toolSystemTestSummary', role: 'status' }),
              this.createElement('ul', { id: 'toolSystemTestList' }),
            ] }),
          ] }),
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
    const tabs = [...this.querySelectorAll('[data-tools-tab]')];
    tabs.forEach((button, index) => {
      button.addEventListener('click', () => this.selectTab(button.dataset.toolsTab, { updateRoute: true }));
      button.addEventListener('keydown', (event) => {
        const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length
          : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length
            : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1;
        if (next < 0) return;
        event.preventDefault();
        this.selectTab(tabs[next].dataset.toolsTab, { focus: true, updateRoute: true });
      });
    });
    this.selectTab('permissions');
    this.querySelector("#inspectJavaScript").addEventListener("click", () => this.emit("inspect-javascript"));
    this.querySelector("#loadChangeHistory").addEventListener("click", () => this.emit("load-change-history"));
    this.querySelector("#closeToolsButton").addEventListener("click", () => dialog.close());
    this.querySelector('#createTool').addEventListener('click', () => this.showToolEditor());
    this.querySelector('#createModuleTool').addEventListener('click', () => this.showToolEditor(null, 'module'));
    this.querySelector('#importTool').addEventListener('click', () => this.querySelector('#toolImportFile').click());
    this.querySelector('#importToolFolder').addEventListener('click', () => this.querySelector('#toolImportFolderFiles').click());
    this.querySelector('#testAllTools').addEventListener('click', () => this.runSystemTest());
    this.querySelector('#toolImportFolderFiles').addEventListener('change', async (event) => {
      try {
        const files = await Promise.all([...event.target.files].map(async (file) => ({ path: file.webkitRelativePath.split('/').slice(1).join('/'), content: await file.text() })));
        const response = await fetch('/api/tools', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'import', files }) });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Unable to import tool folder.');
        await this.loadToolDefinitions();
        this.emit('tool-definitions-changed');
        this.querySelector('#toolPermissionsStatus').textContent = `Imported ${payload.tool.title}.`;
      } catch (error) { this.querySelector('#toolPermissionsStatus').textContent = error.message; }
      event.target.value = '';
    });
    this.querySelector('#toolImportFile').addEventListener('change', async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      this.showToolEditor();
      this.querySelector('#toolManifest').value = await file.text();
      event.target.value = '';
    });
    for (const [id, action] of [['testTool', 'test'], ['saveTool', 'save']]) this.querySelector(`#${id}`).addEventListener('click', () => this.submitTool(action).catch((error) => { this.querySelector('#toolEditorStatus').textContent = error.message; }));
    this.querySelector('#cancelTool').addEventListener('click', () => { this.querySelector('#toolEditor').hidden = true; });
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
