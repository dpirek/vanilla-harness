import BaseComponent from "../base-component.js";

class ImagePreviewModal extends BaseComponent {
  connectedCallback() {
    if (this.childElementCount) return;
    this.style.display = "contents";
    this.render();
  }

  render() {
    this.appendChildren(this, [
      this.createElement("dialog", { "id": "imagePreviewDialog", "class": "imagePreviewDialog", children: [
        this.createElement("section", { "class": "imagePreviewPanel", children: [
          this.createElement("header", { children: [
            this.createElement("div", { children: [
              this.createElement("h2", { "id": "imagePreviewTitle", children: [document.createTextNode("Image Preview")] }),
              this.createElement("p", { "id": "imagePreviewPath", children: [document.createTextNode("")] }),
            ] }),
            this.createElement("button", { "id": "closeImagePreviewButton", "type": "button", "aria-label": "Close image preview", children: [document.createTextNode("×")] }),
          ] }),
          this.createElement("div", { "class": "imagePreviewBody", children: [
            this.createElement("img", { "id": "imagePreviewContent", "alt": "" }),
          ] }),
        ] }),
      ] }),
    ]);
    const dialog = this.querySelector("dialog");
    this.querySelector("#closeImagePreviewButton").addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
  }
}

customElements.define("image-preview-modal", ImagePreviewModal);

export default ImagePreviewModal;
