import BaseComponent from "./base-component.js";
import { workspaceExplorerIcon } from "../lib/icons.js";

class WorkspacePanel extends BaseComponent {
  connectedCallback() {
    if (this.childElementCount) return;
    this.render();
  }

  render() {
    this.setAttribute("role", "complementary");
    this.setAttribute("aria-label", "Workspace files");
    this.appendChildren(this, [
      this.createElement("div", { "class": "filesHeader", children: [this.createElement("div", { children: [this.createElement("h2", { children: [document.createTextNode("Workspace")] }), this.createElement("span", { "id": "filesWorkspaceLabel", children: [document.createTextNode("Files")] })] }), this.createElement("div", { "class": "filesHeaderActions", children: [this.createElement("button", { "id": "selectWorkspaceRootButton", "type": "button", "title": "Choose workspace folder", "aria-label": "Choose workspace folder", children: [workspaceExplorerIcon()] }), this.createElement("button", { "id": "refreshFilesButton", "type": "button", "title": "Refresh files", "aria-label": "Refresh files", children: [document.createTextNode("↻")] })] })] }),
      this.createElement("input", { "id": "workspaceInput", "type": "text", "readonly": "", "hidden": "", "aria-label": "Selected workspace directory" }),
      this.createElement("div", { "id": "workspaceTree", "class": "workspaceTree" })
    ]);
    const input = this.querySelector("#workspaceInput");
    input.addEventListener("change", () => this.emit("workspace-change"));
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault(); input.blur(); this.emit("focus-prompt");
    });
    this.querySelector("#refreshFilesButton").addEventListener("click", () => this.emit("refresh-workspace"));
    this.querySelector("#selectWorkspaceRootButton").addEventListener("click", () => this.emit("choose-workspace"));
  }
}

customElements.define("workspace-panel", WorkspacePanel);

export default WorkspacePanel;
