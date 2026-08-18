import BaseComponent from "../base-component.js";

class FileEditorModal extends BaseComponent {
  connectedCallback() {
    if (this.childElementCount) return;
    this.style.display = "contents";
    this.render();
  }

  render() {
    this.appendChildren(this, [
      this.createElement("dialog", { "id": "fileEditorDialog", "class": "fileEditorDialog", children: [this.createElement("form", { "id": "fileEditorForm", "class": "fileEditorPanel", children: [this.createElement("header", { children: [this.createElement("div", { children: [this.createElement("h2", { "id": "fileEditorTitle", children: [document.createTextNode("Edit file")] }), this.createElement("p", { "id": "fileEditorPath" })] }), this.createElement("button", { "id": "closeFileEditorButton", "type": "button", "aria-label": "Close file editor", children: [document.createTextNode("×")] })] }), this.createElement("div", { "class": "fileEditorBody", children: [this.createElement("textarea", { "id": "fileEditorContent", "spellcheck": "false", "aria-label": "File content" }), this.createElement("section", { "id": "fileEditorPreview", "class": "fileEditorPreview", children: [this.createElement("div", { "class": "fileEditorPreviewHeader", children: [this.createElement("strong", { children: [document.createTextNode("Preview")] }), this.createElement("span", { "id": "fileEditorLanguage", children: [document.createTextNode("Plain text")] })] }), this.createElement("pre", { "class": "fileEditorPreviewContent", children: [this.createElement("code", { "id": "fileEditorPreviewCode" })] })] })] }), this.createElement("footer", { children: [this.createElement("span", { "id": "fileEditorStatus", "role": "status" }), this.createElement("div", { children: [this.createElement("button", { "id": "cancelFileEditorButton", "type": "button", children: [document.createTextNode("Cancel")] }), this.createElement("button", { "id": "saveFileEditorButton", "class": "primaryButton", "type": "submit", children: [document.createTextNode("Save")] })] })] })] })] })
    ]);
    const dialog = this.querySelector("dialog");
    this.querySelector("#closeFileEditorButton").addEventListener("click", () => dialog.close());
    this.querySelector("#cancelFileEditorButton").addEventListener("click", () => dialog.close());
    this.querySelector("form").addEventListener("submit", (event) => { event.preventDefault(); this.emit("save-workspace-file"); });
  }
}

customElements.define("file-editor-modal", FileEditorModal);

export default FileEditorModal;
