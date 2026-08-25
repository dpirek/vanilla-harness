import BaseComponent from "../base-component.js";
import { copyIcon } from "../../lib/icons.js";

class FileEditorModal extends BaseComponent {
  connectedCallback() {
    if (this.childElementCount) return;
    this.style.display = "contents";
    this.render();
  }

  render() {
    this.appendChildren(this, [
      this.createElement("dialog", { "id": "fileEditorDialog", "class": "fileEditorDialog", children: [this.createElement("section", { "class": "fileEditorPanel", "aria-label": "File preview", children: [this.createElement("header", { children: [this.createElement("div", { children: [this.createElement("h2", { "id": "fileEditorTitle", children: [document.createTextNode("File preview")] }), this.createElement("p", { "id": "fileEditorPath" })] }), this.createElement("button", { "id": "closeFileEditorButton", "type": "button", "aria-label": "Close file preview", children: [document.createTextNode("×")] })] }), this.createElement("div", { "class": "fileEditorBody", children: [this.createElement("section", { "id": "fileEditorPreview", "class": "fileEditorPreview", children: [this.createElement("div", { "class": "fileEditorPreviewHeader", children: [this.createElement("strong", { children: [document.createTextNode("Preview")] }), this.createElement("div", { "class": "fileEditorPreviewActions", children: [this.createElement("span", { "id": "fileEditorLanguage", children: [document.createTextNode("Plain text")] }), this.createElement("button", { "id": "copyFilePreviewButton", "class": "fileEditorCopyButton", "type": "button", "title": "Copy source to clipboard", "aria-label": "Copy source to clipboard", disabled: "", children: [copyIcon()] })] })] }), this.createElement("img", { "id": "fileEditorPreviewImage", "class": "fileEditorPreviewImage", hidden: "", alt: "" }), this.createElement("div", { "id": "fileEditorMarkdown", "class": "fileEditorMarkdownContent messageBody", hidden: "" }), this.createElement("pre", { "id": "fileEditorPreviewText", "class": "fileEditorPreviewContent", children: [this.createElement("code", { "id": "fileEditorPreviewCode" })] })] })] }), this.createElement("footer", { children: [this.createElement("span", { "id": "fileEditorStatus", "role": "status" })] })] })] })
    ]);
    const dialog = this.querySelector("dialog");
    this.querySelector("#closeFileEditorButton").addEventListener("click", () => dialog.close());
  }
}

customElements.define("file-editor-modal", FileEditorModal);

export default FileEditorModal;
