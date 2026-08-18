import BaseComponent from "../base-component.js";

class FileEditorModal extends BaseComponent {
  connectedCallback() {
    if (this.childElementCount) return;
    this.style.display = "contents";
    this.render();
  }

  render() {
    this.appendChildren(this, [
      this.createElement("dialog", { "id": "fileEditorDialog", "class": "fileEditorDialog", children: [this.createElement("section", { "class": "fileEditorPanel", "aria-label": "File preview", children: [this.createElement("header", { children: [this.createElement("div", { children: [this.createElement("h2", { "id": "fileEditorTitle", children: [document.createTextNode("File preview")] }), this.createElement("p", { "id": "fileEditorPath" })] }), this.createElement("button", { "id": "closeFileEditorButton", "type": "button", "aria-label": "Close file preview", children: [document.createTextNode("×")] })] }), this.createElement("div", { "class": "fileEditorBody", children: [this.createElement("section", { "id": "fileEditorPreview", "class": "fileEditorPreview", children: [this.createElement("div", { "class": "fileEditorPreviewHeader", children: [this.createElement("strong", { children: [document.createTextNode("Preview")] }), this.createElement("span", { "id": "fileEditorLanguage", children: [document.createTextNode("Plain text")] })] }), this.createElement("pre", { "class": "fileEditorPreviewContent", children: [this.createElement("code", { "id": "fileEditorPreviewCode" })] })] })] }), this.createElement("footer", { children: [this.createElement("span", { "id": "fileEditorStatus", "role": "status" })] })] })] })
    ]);
    const dialog = this.querySelector("dialog");
    this.querySelector("#closeFileEditorButton").addEventListener("click", () => dialog.close());
  }
}

customElements.define("file-editor-modal", FileEditorModal);

export default FileEditorModal;
