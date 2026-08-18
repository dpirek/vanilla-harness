import BaseComponent from "../base-component.js";

class McpModal extends BaseComponent {
  connectedCallback() {
    if (this.childElementCount) return;
    this.style.display = "contents";
    this.render();
  }

  render() {
    const element = (tag, props = {}) => this.createElement(tag, props);
    const text = (value) => document.createTextNode(value);
    this.appendChildren(this, [
      element("dialog", { id: "mcpDialog", class: "settingsDialog", children: [
        element("form", { id: "mcpForm", class: "settingsPanel", method: "dialog", children: [
          element("header", { class: "settingsHeader", children: [
            element("div", { children: [
              element("h2", { children: [text("MCP Configuration")] }),
              element("p", { children: [text("Manage MCP servers stored in SQLite")] }),
            ] }),
            element("button", { id: "closeMcpButton", class: "iconButton", type: "button", "aria-label": "Close MCP configuration", children: [text("×")] }),
          ] }),
          element("div", { id: "mcpTableToolbar", class: "providerTableToolbar", children: [
            element("strong", { children: [text("Configured servers")] }),
            element("div", { children: [
              element("button", { id: "reloadToolsButton", type: "button", children: [text("Reload")] }),
              element("button", { id: "showAddToolButton", type: "button", children: [text("Add server")] }),
            ] }),
          ] }),
          element("section", { id: "mcpEditor", class: "toolsAddPanel", "aria-label": "Add MCP server", hidden: "", children: [
            element("strong", { id: "mcpEditorTitle", children: [text("Add MCP server")] }),
            element("label", { children: [
              element("span", { children: [text("Type")] }),
              element("select", { id: "toolTypeSelect", children: [
                element("option", { value: "remote", children: [text("Remote MCP")] }),
                element("option", { value: "stdio", children: [text("Local stdio MCP")] }),
              ] }),
            ] }),
            element("label", { children: [element("span", { children: [text("Label")] }), element("input", { id: "toolLabelInput", type: "text", placeholder: "docs" })] }),
            element("label", { class: "remoteToolField", children: [element("span", { children: [text("Server URL")] }), element("input", { id: "toolUrlInput", type: "url", placeholder: "https://example.com/mcp" })] }),
            element("label", { class: "stdioToolField", children: [element("span", { children: [text("Command")] }), element("input", { id: "toolCommandInput", type: "text", placeholder: "node" })] }),
            element("label", { class: "stdioToolField", children: [element("span", { children: [text("Args")] }), element("input", { id: "toolArgsInput", type: "text", placeholder: "/absolute/path/to/server.js" })] }),
            element("label", { class: "stdioToolField", children: [element("span", { children: [text("CWD")] }), element("input", { id: "toolCwdInput", type: "text", placeholder: "/absolute/path/to/server" })] }),
            element("div", { class: "mcpEditorActions", children: [
              element("button", { id: "cancelMcpEditorButton", type: "button", children: [text("Cancel")] }),
              element("button", { id: "addToolButton", class: "primaryButton", type: "submit", children: [text("Add server")] }),
            ] }),
          ] }),
          element("section", { class: "toolsListPanel", "aria-label": "Configured MCP servers", children: [
            element("div", { class: "mcpListHeader", children: ["Name", "Type", "Target", "Status", "Actions"].map((label) => element("span", { children: [text(label)] })) }),
            element("div", { id: "toolsList", class: "toolsList" }),
          ] }),
          element("div", { class: "settingsTemplates", "aria-label": "Config templates", hidden: "", children: [
            element("button", { id: "remoteTemplateButton", type: "button", children: [text("Remote MCP")] }),
            element("button", { id: "stdioTemplateButton", type: "button", children: [text("Local stdio MCP")] }),
            element("button", { id: "autoApproveTemplateButton", type: "button", children: [text("Auto approve MCP")] }),
          ] }),
          element("textarea", { id: "configInput", class: "configInput", spellcheck: "false", placeholder: "# MCP configuration stored in SQLite", hidden: "" }),
          element("footer", { class: "settingsFooter", children: [
            element("span", { id: "toolsStatus", class: "configStatus", children: [text("Not loaded")] }),
            element("span", { id: "configStatus", class: "configStatus", hidden: "", children: [text("Config not loaded")] }),
            element("div", { hidden: "", children: [
              element("button", { id: "reloadConfigButton", type: "button", children: [text("Reload config")] }),
              element("button", { id: "saveConfigButton", class: "primaryButton", type: "button", children: [text("Save MCP config")] }),
            ] }),
          ] }),
        ] }),
      ] }),
    ]);

    const dialog = this.querySelector("dialog");
    this.querySelector("#closeMcpButton").addEventListener("click", () => dialog.close());
    this.querySelector("#reloadConfigButton").addEventListener("click", () => this.emit("reload-mcp-config"));
    this.querySelector("#saveConfigButton").addEventListener("click", () => this.emit("save-mcp-config"));
    this.querySelector("#reloadToolsButton").addEventListener("click", () => this.emit("reload-mcp-tools"));
    this.querySelector("#showAddToolButton").addEventListener("click", () => this.emit("show-mcp-editor"));
    this.querySelector("#cancelMcpEditorButton").addEventListener("click", () => this.emit("cancel-mcp-editor"));
    this.querySelector("#toolTypeSelect").addEventListener("change", () => this.emit("mcp-type-change"));
    this.querySelector("form").addEventListener("submit", (event) => { event.preventDefault(); this.emit("add-mcp-tool"); });
    for (const [id, template] of [["remoteTemplateButton", "remote"], ["stdioTemplateButton", "stdio"], ["autoApproveTemplateButton", "autoApprove"]]) {
      this.querySelector(`#${id}`).addEventListener("click", () => this.emit("append-mcp-template", { template }));
    }
  }
}

customElements.define("mcp-modal", McpModal);

export default McpModal;
