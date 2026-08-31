import BaseComponent from "./base-component.js";
import { copyIcon, workspaceExplorerIcon } from "../lib/icons.js";

class WorkspacePanel extends BaseComponent {
  connectedCallback() {
    if (this.childElementCount) return;
    this.render();
  }

  render() {
    this.setAttribute("role", "complementary");
    this.setAttribute("aria-label", "Workspace files");
    this.appendChildren(this, [
      this.createElement("div", { "class": "filesHeader", children: [this.createElement("div", { "class": "filesHeaderTitle", children: [this.createElement("h2", { children: [document.createTextNode("Workspace")] }), this.createElement("div", { "class": "workspacePathRow", children: [this.createElement("span", { "id": "filesWorkspaceLabel", children: [document.createTextNode("Files")] }), this.createElement("button", { "id": "copyWorkspacePathButton", "class": "workspacePathCopyButton", "type": "button", "title": "Copy workspace path", "aria-label": "Copy workspace path", disabled: "", children: [copyIcon()] })] })] }), this.createElement("div", { "class": "filesHeaderActions", children: [this.createElement("button", { "id": "selectWorkspaceRootButton", "type": "button", "title": "Choose workspace folder", "aria-label": "Choose workspace folder", children: [workspaceExplorerIcon()] }), this.createElement("button", { "id": "refreshFilesButton", "type": "button", "title": "Refresh files", "aria-label": "Refresh files", children: [document.createTextNode("↻")] })] })] }),
      this.createElement("input", { "id": "workspaceInput", "type": "text", "readonly": "", "hidden": "", "aria-label": "Selected workspace directory" }),
      this.createElement("div", { "id": "workspaceTree", "class": "workspaceTree" }),
      this.createElement("div", { "class": "workspaceDropOverlay", "role": "status", "aria-live": "polite" })
    ]);
    const input = this.querySelector("#workspaceInput");
    input.addEventListener("change", () => this.emit("workspace-change"));
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault(); input.blur(); this.emit("focus-prompt");
    });
    this.querySelector("#refreshFilesButton").addEventListener("click", () => this.emit("refresh-workspace"));
    this.querySelector("#selectWorkspaceRootButton").addEventListener("click", () => this.emit("choose-workspace"));
    this.querySelector("#copyWorkspacePathButton").addEventListener("click", () => this.emit("copy-workspace-path"));

    let dragDepth = 0;
    const isFileDrag = (event) => [...(event.dataTransfer?.types || [])].includes("Files");
    this.addEventListener("dragenter", (event) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      dragDepth += 1;
      this.setUploadStatus("Drop files to upload", "dragging");
    });
    this.addEventListener("dragover", (event) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    });
    this.addEventListener("dragleave", (event) => {
      if (!isFileDrag(event)) return;
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) this.setUploadStatus();
    });
    this.addEventListener("drop", (event) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      dragDepth = 0;
      this.setUploadStatus();
      const files = [...(event.dataTransfer?.files || [])];
      if (files.length) this.emit("upload-files", { files });
    });
  }

  setUploadStatus(message = "", state = "") {
    const overlay = this.querySelector(".workspaceDropOverlay");
    if (!overlay) return;
    overlay.textContent = message;
    overlay.dataset.state = state;
    overlay.toggleAttribute("data-visible", Boolean(message));
  }
}

customElements.define("workspace-panel", WorkspacePanel);

export default WorkspacePanel;
