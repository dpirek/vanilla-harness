import BaseComponent from "./base-component.js";
import { panelIcon, presetsIcon } from "../lib/icons.js";

class HarnessSidebar extends BaseComponent {
  connectedCallback() {
    if (this.childElementCount) return;
    this.render();
  }

  render() {
    this.setAttribute("role", "complementary");
    this.setAttribute("aria-label", "Conversation navigation");
    this.appendChildren(this, [
      this.createElement("header", { "class": "sidebarTop", children: [this.createElement("div", { "class": "brand", children: [this.createElement("img", { "src": "/logo.svg", "alt": "", "aria-hidden": "true" })] }), this.createElement("button", { "id": "sidebarToggleButton", "class": "sidebarToggle", "type": "button", "aria-label": "Collapse sidebar", "aria-pressed": "false", "title": "Collapse sidebar", children: [this.createElement("img", { "class": "sidebarToggleLogo", "src": "/logo.svg", "alt": "", "aria-hidden": "true" }), panelIcon()] })] }),
      this.createElement("nav", { "class": "navList", "aria-label": "Main", children: [this.createElement("button", { "id": "newChatButton", "type": "button", "title": "New chat", children: [this.createElement("span", { "class": "navIcon", children: [document.createTextNode("✎")] }), this.createElement("span", { "class": "navLabel", children: [document.createTextNode("New chat")] })] }), this.createElement("button", { "id": "settingsButton", "type": "button", "title": "Providers", children: [this.createElement("span", { "class": "navIcon", children: [document.createTextNode("◇")] }), this.createElement("span", { "class": "navLabel", children: [document.createTextNode("Providers")] })] }), this.createElement("button", { "id": "presetsButton", "type": "button", "title": "Presets", children: [this.createElement("span", { "class": "navIcon", children: [presetsIcon("workspaceExplorerIcon")] }), this.createElement("span", { "class": "navLabel", children: [document.createTextNode("Presets")] })] }), this.createElement("button", { "id": "systemPromptsButton", "type": "button", "title": "System prompts", children: [this.createElement("span", { "class": "navIcon", children: [document.createTextNode("¶")] }), this.createElement("span", { "class": "navLabel", children: [document.createTextNode("System prompts")] })] }), this.createElement("button", { "id": "skillsButton", "type": "button", "title": "Skills", children: [this.createElement("span", { "class": "navIcon", children: [document.createTextNode("☷")] }), this.createElement("span", { "class": "navLabel", children: [document.createTextNode("Skills")] })] }), this.createElement("button", { "id": "toolsButton", "type": "button", "title": "Tools", children: [this.createElement("span", { "class": "navIcon", children: [document.createTextNode("⚒")] }), this.createElement("span", { "class": "navLabel", children: [document.createTextNode("Tools")] })] }), this.createElement("button", { "id": "mcpButton", "type": "button", "title": "MCP configuration", children: [this.createElement("span", { "class": "navIcon", children: [document.createTextNode("⛓")] }), this.createElement("span", { "class": "navLabel", children: [document.createTextNode("MCP configuration")] })] })] }),
      this.createElement("section", { "class": "sidebarSection recents", "aria-label": "Recent conversations", children: [this.createElement("h2", { children: [document.createTextNode("Recents")] }), this.createElement("div", { "id": "recentsList", "class": "recentsList" })] }),
      this.createElement("footer", { "class": "account", children: [this.createElement("button", { "id": "providerShortcutButton", "class": "providerShortcutButton", "type": "button", "title": "Manage providers", "aria-label": "Manage providers", children: [this.createElement("span", { "id": "workspaceMeta", children: [document.createTextNode("Connecting...")] })] })] })
    ]);
    this.querySelector("#newChatButton").addEventListener("click", () => this.emit("new-chat"));
    this.querySelector("#sidebarToggleButton").addEventListener("click", () => this.emit("toggle-sidebar"));
    const dialogs = { settingsButton: "providers", providerShortcutButton: "providers", presetsButton: "presets", systemPromptsButton: "system-prompts", skillsButton: "skills", toolsButton: "tools", mcpButton: "mcp" };
    for (const [id, modal] of Object.entries(dialogs)) {
      this.querySelector(`#${id}`).addEventListener("click", () => this.emit("open-modal", { modal }));
    }
  }
}

customElements.define("harness-sidebar", HarnessSidebar);

export default HarnessSidebar;
