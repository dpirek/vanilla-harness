import BaseComponent from "../base-component.js";

class PresetsModal extends BaseComponent {
  connectedCallback() {
    if (this.childElementCount) return;
    this.style.display = "contents";
    this.render();
  }

  render() {
    this.appendChildren(this, [
      this.createElement("dialog", { id: "presetsDialog", class: "settingsDialog presetsDialog", children: [
        this.createElement("section", { class: "settingsPanel", children: [
          this.createElement("header", { class: "settingsHeader", children: [
            this.createElement("div", { class: "presetHeaderIdentity", children: [
              this.createElement("button", { id: "backToPresetsButton", class: "iconButton", type: "button", hidden: "", "aria-label": "Back to presets", children: [document.createTextNode("←")] }),
              this.createElement("div", { children: [
                this.createElement("h2", { id: "presetsDialogTitle", children: [document.createTextNode("Presets")] }),
                this.createElement("p", { id: "presetsDialogDescription", children: [document.createTextNode("Manage shared provider, prompt, tool, MCP, and workflow configurations")] }),
              ] }),
            ] }),
            this.createElement("button", { id: "closePresetsButton", class: "iconButton", type: "button", "aria-label": "Close presets", children: [document.createTextNode("×")] }),
          ] }),
          this.createElement("div", { id: "presetsListView", class: "presetsListView", children: [
            this.createElement("div", { class: "presetsToolbar", children: [
              this.createElement("strong", { id: "presetsCount", children: [document.createTextNode("0 presets")] }),
              this.createElement("button", { id: "createPresetButton", class: "primaryButton", type: "button", children: [document.createTextNode("Duplicate current")] }),
            ] }),
            this.createElement("div", { id: "presetsList", class: "presetsList", "aria-live": "polite" }),
          ] }),
          this.createElement("form", { id: "presetEditorForm", class: "presetEditor", hidden: "", children: [
            this.createElement("section", { class: "presetEditorSection presetGeneralSection", children: [
              this.createElement("div", { class: "presetSectionHeading", children: [
                this.createElement("span", { children: [document.createTextNode("01")] }),
                this.createElement("div", { children: [this.createElement("h3", { children: [document.createTextNode("Identity & provider")] }), this.createElement("p", { children: [document.createTextNode("Name the preset and choose its model connection.")] })] }),
              ] }),
              this.createElement("div", { class: "presetFieldGrid", children: [
                this.createElement("label", { class: "presetField presetFieldWide", children: [this.createElement("span", { children: [document.createTextNode("Preset name")] }), this.createElement("input", { id: "presetEditorName", type: "text", required: "", maxlength: "120" })] }),
                this.createElement("label", { class: "presetField presetFieldWide", children: [this.createElement("span", { children: [document.createTextNode("Provider identity")] }), this.createElement("select", { id: "presetEditorProvider", required: "" })] }),
              ] }),
            ] }),
            this.createElement("section", { class: "presetEditorSection", children: [
              this.createElement("div", { class: "presetSectionHeading", children: [
                this.createElement("span", { children: [document.createTextNode("02")] }),
                this.createElement("div", { children: [this.createElement("h3", { children: [document.createTextNode("Workflow")] }), this.createElement("p", { children: [document.createTextNode("Configure the workflow interface and processing modules.")] })] }),
              ] }),
              this.createElement("div", { class: "presetFieldGrid", children: [
                this.createElement("label", { class: "presetField presetFieldWide", children: [this.createElement("span", { children: [document.createTextNode("Input source")] }), this.createElement("select", { id: "presetEditorInputSource", children: [this.createElement("option", { value: "microphone", children: [document.createTextNode("Microphone")] }), this.createElement("option", { value: "keyboard", children: [document.createTextNode("Keyboard")] })] })] }),
              ] }),
              this.createElement("div", { class: "presetToggleGrid", "aria-label": "Workflow modules", children: [
                this.toggle("presetEffectComposer", "Composer", "Prompt composition stage"),
                this.toggle("presetEffectTools", "Tools", "Local tool execution stage"),
                this.toggle("presetEffectMcp", "MCP", "Connected MCP server stage"),
                this.toggle("presetEffectValidation", "Validation", "Post-change validation stage"),
              ] }),
            ] }),
            this.createElement("section", { class: "presetEditorSection", children: [
              this.createElement("div", { class: "presetSectionHeading", children: [
                this.createElement("span", { children: [document.createTextNode("03")] }),
                this.createElement("div", { children: [this.createElement("h3", { children: [document.createTextNode("Tool permissions")] }), this.createElement("p", { children: [document.createTextNode("Choose which local capabilities this preset may use.")] })] }),
              ] }),
              this.createElement("div", { class: "presetToggleGrid", "aria-label": "Tool permissions", children: [
                this.toggle("presetToolListFiles", "List files", "Browse workspace entries"),
                this.toggle("presetToolReadFile", "Read files", "Read workspace content"),
                this.toggle("presetToolWriteFile", "Write files", "Create and edit files"),
                this.toggle("presetToolSearchFiles", "Search files", "Search workspace content"),
                this.toggle("presetToolCurl", "HTTP requests", "Request HTTP and HTTPS URLs"),
                this.toggle("presetToolRunCommand", "Run commands", "Execute shell commands"),
              ] }),
            ] }),
            this.createElement("section", { class: "presetEditorSection", children: [
              this.createElement("div", { class: "presetSectionHeading", children: [
                this.createElement("span", { children: [document.createTextNode("04")] }),
                this.createElement("div", { children: [this.createElement("h3", { children: [document.createTextNode("System prompts")] }), this.createElement("p", { children: [document.createTextNode("Edit every instruction stored in the preset snapshot.")] })] }),
              ] }),
              this.createElement("div", { id: "presetSystemPrompts", class: "presetPromptList" }),
            ] }),
            this.createElement("section", { class: "presetEditorSection", children: [
              this.createElement("div", { class: "presetSectionHeading", children: [
                this.createElement("span", { children: [document.createTextNode("05")] }),
                this.createElement("div", { children: [this.createElement("h3", { children: [document.createTextNode("MCP configuration")] }), this.createElement("p", { children: [document.createTextNode("Manage the MCP servers stored with this preset in SQLite.")] })] }),
              ] }),
              this.createElement("div", { id: "presetMcpServerList", class: "presetMcpServerList" }),
              this.createElement("div", { class: "presetMcpAddHeading", children: [
                this.createElement("h4", { children: [document.createTextNode("Add server")] }),
                this.createElement("span", { children: [document.createTextNode("Remote URL or local stdio process")] }),
              ] }),
              this.createElement("div", { id: "presetMcpAddForm", class: "presetMcpAddForm", children: [
                this.createElement("label", { children: [this.createElement("span", { children: [document.createTextNode("Server type")] }), this.createElement("select", { id: "presetMcpType", children: [this.createElement("option", { value: "remote", children: [document.createTextNode("Remote MCP")] }), this.createElement("option", { value: "stdio", children: [document.createTextNode("Local stdio MCP")] })] })] }),
                this.createElement("label", { children: [this.createElement("span", { children: [document.createTextNode("Label")] }), this.createElement("input", { id: "presetMcpLabel", type: "text", spellcheck: "false", placeholder: "docs" })] }),
                this.createElement("label", { id: "presetMcpUrlField", children: [this.createElement("span", { children: [document.createTextNode("Server URL")] }), this.createElement("input", { id: "presetMcpUrl", type: "url", spellcheck: "false", placeholder: "https://example.com/mcp" })] }),
                this.createElement("label", { class: "presetMcpStdioField", hidden: "", children: [this.createElement("span", { children: [document.createTextNode("Command")] }), this.createElement("input", { id: "presetMcpCommand", type: "text", spellcheck: "false", placeholder: "node" })] }),
                this.createElement("label", { class: "presetMcpStdioField", hidden: "", children: [this.createElement("span", { children: [document.createTextNode("Arguments")] }), this.createElement("input", { id: "presetMcpArgs", type: "text", spellcheck: "false", placeholder: "server.js --port 3000" })] }),
                this.createElement("label", { class: "presetMcpStdioField", hidden: "", children: [this.createElement("span", { children: [document.createTextNode("Working directory")] }), this.createElement("input", { id: "presetMcpCwd", type: "text", spellcheck: "false", placeholder: "Optional" })] }),
                this.createElement("button", { id: "addPresetMcpServerButton", type: "button", children: [document.createTextNode("Add server")] }),
              ] }),
              this.createElement("p", { id: "presetMcpStatus", class: "presetMcpStatus", role: "status", children: [document.createTextNode("Loaded from this preset's SQLite record.")] }),
            ] }),
            this.createElement("footer", { class: "presetEditorActions", children: [
              this.createElement("button", { id: "cancelPresetEditButton", type: "button", children: [document.createTextNode("Cancel")] }),
              this.createElement("button", { id: "savePresetEditButton", class: "primaryButton", type: "submit", children: [document.createTextNode("Save preset")] }),
            ] }),
          ] }),
          this.createElement("footer", { class: "settingsFooter", children: [
            this.createElement("span", { id: "presetsStatus", class: "configStatus", role: "status", children: [document.createTextNode("Presets are shared with the workflow interface.")] }),
          ] }),
        ] }),
      ] }),
    ]);

    const dialog = this.querySelector("dialog");
    this.querySelector("#closePresetsButton").addEventListener("click", () => dialog.close());
    this.querySelector("#createPresetButton").addEventListener("click", () => this.emit("create-preset"));
    this.querySelector("#presetEditorProvider").addEventListener("change", () => this.emit("preset-provider-change"));
    this.querySelector("#presetMcpType").addEventListener("change", () => this.emit("preset-mcp-type-change"));
    this.querySelector("#addPresetMcpServerButton").addEventListener("click", () => this.emit("add-preset-mcp-server"));
    this.querySelector("#presetMcpAddForm").addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      this.emit("add-preset-mcp-server");
    });
    this.querySelector("#backToPresetsButton").addEventListener("click", () => this.emit("cancel-preset-edit"));
    this.querySelector("#cancelPresetEditButton").addEventListener("click", () => this.emit("cancel-preset-edit"));
    this.querySelector("#presetEditorForm").addEventListener("submit", (event) => {
      event.preventDefault();
      this.emit("save-preset-edit");
    });
    dialog.addEventListener("close", () => this.emit("cancel-preset-edit"));
  }

  toggle(id, title, description) {
    return this.createElement("label", { class: "presetToggle", children: [
      this.createElement("input", { id, type: "checkbox" }),
      this.createElement("span", { children: [
        this.createElement("strong", { children: [document.createTextNode(title)] }),
        this.createElement("small", { children: [document.createTextNode(description)] }),
      ] }),
    ] });
  }
}

customElements.define("presets-modal", PresetsModal);

export default PresetsModal;
