import BaseComponent from "./base-component.js";
import { bootstrapIcon, panelIcon } from "../lib/icons.js";

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
      "aria-label": label,
      children: [
        this.createElement("span", { class: "navIcon", children: [bootstrapIcon(icon)] }),
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
    this.appendChildren(this, [
      this.createElement("header", {
        class: "sidebarTop",
        children: [
          this.createElement("div", {
            class: "brand",
            children: [
              this.createElement("img", { src: "/logo.svg", alt: "", "aria-hidden": "true" }),
              this.createElement("span", { class: "brandName", textContent: "Vanilla" }),
            ],
          }),
          sidebarToggle,
        ],
      }),
      this.createElement("nav", {
        class: "sidebarSection recents conversationMenu",
        "aria-label": "Conversations",
        children: [
          this.navButton("newChatButton", "pencil-square", "New chat"),
          this.createElement("div", { id: "recentsList", class: "recentsList" }),
        ],
      }),
      this.createElement("footer", { class: "account", children: [
        this.createElement("a", {
          id: "collapsedModelsLink", class: "collapsedModelsLink",
          href: "/models", "data-app-route": "", title: "Models", "aria-label": "Models",
          children: [bootstrapIcon("grid")],
        }),
      ] }),
    ]);

    this.querySelector("#newChatButton").addEventListener("click", () => this.emit("new-chat"));
    sidebarToggle.addEventListener("click", () => this.emit("toggle-sidebar"));
  }
}

customElements.define("harness-sidebar", HarnessSidebar);

export default HarnessSidebar;
