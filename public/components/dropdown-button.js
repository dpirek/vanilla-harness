import BaseComponent from "./base-component.js";

class DropdownButton extends BaseComponent {
  connectedCallback() {
    if (!this.childElementCount) this.render();
    this.boundDocumentPointerDown ||= (event) => {
      if (this.open && !this.contains(event.target)) this.close();
    };
    this.boundDocumentKeyDown ||= (event) => {
      if (event.key === "Escape" && this.open) this.close({ restoreFocus: true });
    };
    document.addEventListener("pointerdown", this.boundDocumentPointerDown);
    document.addEventListener("keydown", this.boundDocumentKeyDown);
  }

  disconnectedCallback() {
    document.removeEventListener("pointerdown", this.boundDocumentPointerDown);
    document.removeEventListener("keydown", this.boundDocumentKeyDown);
  }

  render() {
    const label = this.createElement("span", {
      class: "dropdownButtonLabel",
      textContent: this.getAttribute("placeholder") || "Select",
    });
    const caret = this.createElement("svg", {
      class: "dropdownButtonCaret",
      viewBox: "0 0 12 12",
      fill: "none",
      "aria-hidden": "true",
      focusable: "false",
      children: [this.createElement("path", {
        d: "M2.5 4.25 6 7.75l3.5-3.5",
        stroke: "currentColor",
        "stroke-width": "1.5",
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
      })],
    });
    const trigger = this.createElement("button", {
      class: "dropdownButtonTrigger",
      type: "button",
      "aria-haspopup": "menu",
      "aria-expanded": "false",
      title: this.getAttribute("aria-label") || "Open menu",
      children: [label, caret],
    });
    const menu = this.createElement("div", {
      class: "dropdownButtonMenu",
      role: "menu",
      "aria-label": this.getAttribute("aria-label") || "Select an option",
      hidden: "",
    });
    this.appendChildren(this, [trigger, menu]);
    this.trigger = trigger;
    this.labelElement = label;
    this.menu = menu;
    trigger.addEventListener("click", () => this.toggle());
    menu.addEventListener("keydown", (event) => this.handleMenuKeydown(event));
  }

  get open() {
    return !this.menu?.hidden;
  }

  setLabel(label, { title } = {}) {
    this.labelElement.textContent = String(label || this.getAttribute("placeholder") || "Select");
    this.trigger.title = title || this.labelElement.textContent;
  }

  setItems(items = []) {
    this.menu.replaceChildren();
    for (const item of items) {
      if (item.type === "separator") {
        const separator = this.createElement("span", { class: "dropdownButtonDivider", role: "separator" });
        this.menu.append(separator);
        continue;
      }
      if (item.type === "status") {
        const status = this.createElement("span", {
          class: "dropdownButtonStatus",
          textContent: item.label,
        });
        this.menu.append(status);
        continue;
      }
      const option = this.createElement("button", {
        type: "button",
        class: `dropdownButtonOption${item.selected ? " active" : ""}${item.action ? " action" : ""}`,
        role: item.selected === undefined ? "menuitem" : "menuitemradio",
        children: [
          this.createElement("span", { class: "dropdownButtonOptionLabel", textContent: item.label }),
          this.createElement("span", {
            class: "dropdownButtonCheck",
            "aria-hidden": "true",
            textContent: item.selected ? "✓" : "",
          }),
        ],
      });
      if (item.selected !== undefined) option.setAttribute("aria-checked", String(item.selected));
      option.disabled = item.disabled === true;
      option.addEventListener("click", () => {
        this.close({ restoreFocus: true });
        this.emit("dropdown-select", { value: item.value });
      });
      this.menu.append(option);
    }
  }

  show() {
    if (this.open) return;
    this.menu.hidden = false;
    this.trigger.setAttribute("aria-expanded", "true");
    this.menu.querySelector("button:not(:disabled)")?.focus();
  }

  close({ restoreFocus = false } = {}) {
    this.menu.hidden = true;
    this.trigger.setAttribute("aria-expanded", "false");
    if (restoreFocus) this.trigger.focus();
  }

  toggle() {
    if (this.open) this.close();
    else this.show();
  }

  handleMenuKeydown(event) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const options = [...this.menu.querySelectorAll("button:not(:disabled)")];
    if (options.length === 0) return;
    event.preventDefault();
    const current = options.indexOf(document.activeElement);
    const index = event.key === "Home"
      ? 0
      : event.key === "End"
        ? options.length - 1
        : event.key === "ArrowDown"
          ? (current + 1) % options.length
          : (current <= 0 ? options.length : current) - 1;
    options[index].focus();
  }
}

customElements.define("dropdown-button", DropdownButton);

export default DropdownButton;
