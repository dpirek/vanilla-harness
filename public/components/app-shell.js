import BaseComponent from "./base-component.js";
import "./modals/workspace-picker-modal.js";
import "./modals/create-workspace-modal.js";
import "./modals/file-editor-modal.js";
import "./modals/providers-modal.js";
import "./modals/presets-modal.js";
import "./modals/system-prompts-modal.js";
import "./modals/skills-modal.js";
import "./modals/tools-modal.js";
import "./modals/mcp-modal.js";
import "./modals/workflow-modal.js";

class AppShellContent extends BaseComponent {
  connectedCallback() {
    if (this.childElementCount) return;
    this.style.display = "contents";
    this.render();
  }

  render() {
    const element = (tag, props = {}) => this.createElement(tag, props);
    this.appendChildren(this, [
      element("harness-sidebar", { class: "sidebar" }),
      element("column-resize-handle", { id: "sidebarResizeHandle", class: "columnResizeHandle sidebarResizeHandle", label: "Resize navigation column" }),
      element("harness-chat", { class: "chat" }),
      element("column-resize-handle", { id: "filesResizeHandle", class: "columnResizeHandle filesResizeHandle", label: "Resize workspace files column" }),
      element("workspace-panel", { class: "filesColumn" }),
      element("workspace-picker-modal"),
      element("create-workspace-modal"),
      element("file-editor-modal"),
      element("providers-modal"),
      element("presets-modal"),
      element("system-prompts-modal"),
      element("skills-modal"),
      element("tools-modal"),
      element("mcp-modal"),
      element("workflow-modal"),
    ]);
  }
}

customElements.define("app-shell-content", AppShellContent);

function mountAppShell() {
  const appShell = document.querySelector("#appShell");
  if (!appShell) throw new Error("Application shell mount point is missing.");
  appShell.replaceChildren(document.createElement("app-shell-content"));
  return appShell;
}

export { mountAppShell };
