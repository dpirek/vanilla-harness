import BaseComponent from "../base-component.js";
import { newWorkspaceIcon } from "../../lib/icons.js";

class WorkspacePickerModal extends BaseComponent {
  connectedCallback() {
    if (this.childElementCount) return;
    this.style.display = "contents";
    this.render();
  }

  render() {
    this.appendChildren(this, [
      this.createElement("dialog", { "id": "workspacePickerDialog", "class": "workspacePickerDialog", children: [this.createElement("form", { "method": "dialog", "class": "workspacePickerPanel", children: [this.createElement("header", { children: [this.createElement("div", { children: [this.createElement("h2", { children: [document.createTextNode("Select workspace folder")] }), this.createElement("p", { "id": "workspacePickerPath", children: [document.createTextNode("Choose a folder")] })] }), this.createElement("div", { children: [this.createElement("button", { "id": "createWorkspaceButton", "type": "button", "title": "Create new workspace folder here", "aria-label": "Create new workspace folder here", children: [newWorkspaceIcon()] }), this.createElement("button", { "id": "parentWorkspacePickerButton", "type": "button", "title": "Go to parent folder", "aria-label": "Go to parent folder", children: [document.createTextNode("↑")] }), this.createElement("button", { "id": "closeWorkspacePickerButton", "type": "button", "aria-label": "Close folder picker", children: [document.createTextNode("×")] })] })] }), this.createElement("div", { "id": "workspacePickerTree", "class": "workspacePickerTree" }), this.createElement("footer", { children: [this.createElement("button", { "type": "button", "id": "cancelWorkspacePickerButton", children: [document.createTextNode("Cancel")] }), this.createElement("button", { "type": "button", "id": "confirmWorkspacePickerButton", "class": "primaryButton", children: [document.createTextNode("Select folder")] })] })] })] })
    ]);
    const dialog = this.querySelector("dialog");
    this.querySelector("#closeWorkspacePickerButton").addEventListener("click", () => dialog.close());
    this.querySelector("#cancelWorkspacePickerButton").addEventListener("click", () => dialog.close());
    this.querySelector("#parentWorkspacePickerButton").addEventListener("click", () => this.emit("workspace-picker-parent"));
    this.querySelector("#createWorkspaceButton").addEventListener("click", () => this.emit("create-workspace"));
    this.querySelector("#confirmWorkspacePickerButton").addEventListener("click", () => this.emit("workspace-picker-confirm"));
  }
}

customElements.define("workspace-picker-modal", WorkspacePickerModal);

export default WorkspacePickerModal;
