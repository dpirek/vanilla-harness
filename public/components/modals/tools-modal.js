import BaseComponent from "../base-component.js";

const TOOL_ROWS = [
  ["List files", "List files and folders inside the workspace.", "list_files"],
  ["Search files", "Search workspace text files with a regular expression.", "search_files"],
  ["Read files", "Read selected UTF-8 file contents from the workspace.", "read_file"],
  ["Write files", "Create or replace UTF-8 files inside the workspace.", "write_file"],
  ["Curl", "Fetch HTTP or HTTPS URLs for API and web inspection.", "curl"],
  ["Run commands", "Run shell commands in the workspace.", "run_command"],
  ["Chrome DevTools", "Browse pages, inspect source, run JavaScript, and save screenshots.", "chrome_devtools"],
];

class ToolsModal extends BaseComponent {
  connectedCallback() {
    if (this.childElementCount) return;
    this.style.display = "contents";
    this.render();
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
                this.createElement("p", { children: [document.createTextNode("Choose which built-in workspace tools the model can call")] }),
              ] }),
              this.createElement("button", {
                id: "closeToolsButton",
                class: "iconButton",
                type: "button",
                "aria-label": "Close tools",
                children: [document.createTextNode("×")],
              }),
            ],
          }),
          this.createElement("section", {
            class: "toolPermissions",
            "aria-label": "Local tool permissions",
            children: [
              this.createElement("div", {
                class: "toolPermissionsHeader",
                children: [
                  this.createElement("h3", { children: [document.createTextNode("Allowed Tool Calls")] }),
                  this.createElement("p", { children: [document.createTextNode("Enabled tools are authorized to run without an additional prompt.")] }),
                ],
              }),
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
    this.querySelector("#closeToolsButton").addEventListener("click", () => dialog.close());
    this.querySelector("form").addEventListener("submit", (event) => {
      event.preventDefault();
      this.emit("save-tool-permissions");
    });
  }
}

customElements.define("tools-modal", ToolsModal);

export default ToolsModal;
