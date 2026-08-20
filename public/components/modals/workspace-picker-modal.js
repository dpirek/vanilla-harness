import BaseComponent from "../base-component.js";
import { newWorkspaceIcon } from "../../lib/icons.js";

class WorkspacePickerModal extends BaseComponent {
  connectedCallback() {
    if (this.childElementCount) return;
    this.style.display = "contents";
    this.render();
  }

  render() {
    const title = this.createElement("h2", {
      id: "workspacePickerTitle",
      textContent: "Select workspace folder",
    });
    const path = this.createElement("p", {
      id: "workspacePickerPath",
      textContent: "Choose a folder",
    });
    const createButton = this.createElement("button", {
      id: "createWorkspaceButton",
      type: "button",
      title: "Create new workspace folder here",
      "aria-label": "Create new workspace folder here",
      children: [newWorkspaceIcon()],
    });
    const parentButton = this.createElement("button", {
      id: "parentWorkspacePickerButton",
      type: "button",
      title: "Go to parent folder",
      "aria-label": "Go to parent folder",
      textContent: "↑",
    });
    const closeButton = this.createElement("button", {
      id: "closeWorkspacePickerButton",
      type: "button",
      "aria-label": "Close folder picker",
      textContent: "×",
    });
    const cancelButton = this.createElement("button", {
      id: "cancelWorkspacePickerButton",
      type: "button",
      textContent: "Cancel",
    });
    const confirmButton = this.createElement("button", {
      id: "confirmWorkspacePickerButton",
      type: "button",
      class: "primaryButton",
      textContent: "Select folder",
    });
    const dialog = this.createElement("dialog", {
      id: "workspacePickerDialog",
      class: "workspacePickerDialog",
      children: [
        this.createElement("form", {
          method: "dialog",
          class: "workspacePickerPanel",
          children: [
            this.createElement("header", {
              children: [
                this.createElement("div", { children: [title, path] }),
                this.createElement("div", { children: [createButton, parentButton, closeButton] }),
              ],
            }),
            this.createElement("div", { id: "workspacePickerTree", class: "workspacePickerTree" }),
            this.createElement("footer", { children: [cancelButton, confirmButton] }),
          ],
        }),
      ],
    });

    this.append(dialog);
    closeButton.addEventListener("click", () => dialog.close());
    cancelButton.addEventListener("click", () => dialog.close());
    parentButton.addEventListener("click", () => this.emit("workspace-picker-parent"));
    createButton.addEventListener("click", () => this.emit("create-workspace"));
    confirmButton.addEventListener("click", () => this.emit("workspace-picker-confirm"));
  }
}

customElements.define("workspace-picker-modal", WorkspacePickerModal);

export default WorkspacePickerModal;
