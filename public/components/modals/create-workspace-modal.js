import BaseComponent from "../base-component.js";

class CreateWorkspaceModal extends BaseComponent {
  connectedCallback() {
    if (this.childElementCount) return;
    this.style.display = "contents";
    this.render();
  }

  render() {
    this.appendChildren(this, [
      this.createElement("dialog", { id: "createWorkspaceDialog", class: "createWorkspaceDialog", children: [
        this.createElement("form", { id: "createWorkspaceForm", class: "createWorkspacePanel", children: [
          this.createElement("header", { children: [
            this.createElement("div", { children: [
              this.createElement("h2", { children: [document.createTextNode("Create new workspace")] }),
              this.createElement("p", { id: "createWorkspaceParent", children: [document.createTextNode("Choose a folder name")] }),
            ] }),
            this.createElement("button", { id: "closeCreateWorkspaceButton", type: "button", "aria-label": "Close create workspace dialog", children: [document.createTextNode("×")] }),
          ] }),
          this.createElement("label", { children: [
            document.createTextNode("Folder name"),
            this.createElement("input", { id: "createWorkspaceName", type: "text", maxlength: "255", autocomplete: "off", placeholder: "my-project", required: "" }),
          ] }),
          this.createElement("p", { id: "createWorkspaceStatus", class: "createWorkspaceStatus", role: "status" }),
          this.createElement("footer", { children: [
            this.createElement("button", { id: "cancelCreateWorkspaceButton", type: "button", children: [document.createTextNode("Cancel")] }),
            this.createElement("button", { id: "confirmCreateWorkspaceButton", class: "primaryButton", type: "submit", children: [document.createTextNode("Create & select")] }),
          ] }),
        ] }),
      ] }),
    ]);

    const dialog = this.querySelector("dialog");
    this.querySelector("#closeCreateWorkspaceButton").addEventListener("click", () => dialog.close());
    this.querySelector("#cancelCreateWorkspaceButton").addEventListener("click", () => dialog.close());
    this.querySelector("form").addEventListener("submit", (event) => {
      event.preventDefault();
      this.emit("create-workspace-confirm");
    });
  }
}

customElements.define("create-workspace-modal", CreateWorkspaceModal);

export default CreateWorkspaceModal;
