import BaseComponent from "./base-component.js";
import { panelIcon } from "../lib/icons.js";

class HarnessSidebar extends BaseComponent {
  connectedCallback() {
    if (this.childElementCount) return;
    this.render();
  }

  navButton(id, icon, label) {
    return this.createElement("button", {
      id,
      type: "button",
      title: label,
      children: [
        this.createElement("span", { class: "navIcon", children: [document.createTextNode(icon)] }),
        this.createElement("span", { class: "navLabel", textContent: label }),
      ],
    });
  }

  render() {
    this.setAttribute("role", "complementary");
    this.setAttribute("aria-label", "Conversation navigation");
    const sidebarToggle = this.createElement("button", {
      id: "sidebarToggleButton",
      class: "sidebarToggle",
      type: "button",
      "aria-label": "Collapse sidebar",
      "aria-pressed": "false",
      title: "Collapse sidebar",
      children: [
        this.createElement("img", { class: "sidebarToggleLogo", src: "/logo.svg", alt: "", "aria-hidden": "true" }),
        panelIcon(),
      ],
    });
    const providerShortcut = this.createElement("button", {
      id: "providerShortcutButton",
      class: "providerShortcutButton",
      type: "button",
      title: "Manage providers",
      "aria-label": "Manage providers",
      children: [this.createElement("span", { id: "workspaceMeta", textContent: "Connecting..." })],
    });

    this.appendChildren(this, [
      this.createElement("header", {
        class: "sidebarTop",
        children: [
          this.createElement("div", {
            class: "brand",
            children: [this.createElement("img", { src: "/logo.svg", alt: "", "aria-hidden": "true" })],
          }),
          sidebarToggle,
        ],
      }),
      this.createElement("nav", {
        class: "navList",
        "aria-label": "Main",
        children: [
          this.navButton("newChatButton", "✎", "New chat"),
          this.navButton("settingsButton", "◇", "Providers"),
          this.navButton("systemPromptsButton", "¶", "System prompts"),
          this.navButton("skillsButton", "☷", "Skills"),
          this.navButton("toolsButton", "⚒", "Tools"),
          this.navButton("mcpButton", "⛓", "MCP configuration"),
        ],
      }),
      this.createElement("section", {
        class: "sidebarSection recents",
        "aria-label": "Recent conversations",
        children: [
          this.createElement("h2", { textContent: "Recents" }),
          this.createElement("div", { id: "recentsList", class: "recentsList" }),
        ],
      }),
      this.createElement("footer", { class: "account", children: [providerShortcut] }),
    ]);

    this.querySelector("#newChatButton").addEventListener("click", () => this.emit("new-chat"));
    sidebarToggle.addEventListener("click", () => this.emit("toggle-sidebar"));
    const dialogs = {
      settingsButton: "providers",
      providerShortcutButton: "providers",
      systemPromptsButton: "system-prompts",
      skillsButton: "skills",
      toolsButton: "tools",
      mcpButton: "mcp",
    };
    for (const [id, modal] of Object.entries(dialogs)) {
      this.querySelector(`#${id}`).addEventListener("click", () => this.emit("open-modal", { modal }));
    }
  }
}

customElements.define("harness-sidebar", HarnessSidebar);

export default HarnessSidebar;
