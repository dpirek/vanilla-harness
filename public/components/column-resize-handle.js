import BaseComponent from "./base-component.js";

class ColumnResizeHandle extends BaseComponent {
  connectedCallback() {
    this.setAttribute("role", "separator");
    this.setAttribute("aria-label", this.getAttribute("label") || "Resize column");
    this.setAttribute("aria-orientation", "vertical");
    this.tabIndex = 0;
    this.removeAttribute("label");
    this.addEventListener("pointerdown", (event) => this.emit("column-resize-start", { sourceEvent: event }));
    this.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault(); this.emit("column-resize-key", { key: event.key });
    });
  }
}

customElements.define("column-resize-handle", ColumnResizeHandle);

export default ColumnResizeHandle;
