import BaseComponent from "./base-component.js";

const DEFAULT_CONTROLS = [
  { label: "TEMP", value: "0.20" },
  { label: "TOP_P", value: "1.00" },
  { label: "TOP_K", value: "40" },
  { label: "MAX_TOKENS", value: "2000" },
  { label: "FREQ_PEN", value: "0.00" },
  { label: "PRES_PEN", value: "0.00" },
];

class ModelEngine extends BaseComponent {
  constructor({
    model = "GPT-4.1",
    title = "MODEL ENGINE",
    color = "#d49b17",
    controls = DEFAULT_CONTROLS,
    handlers = {},
  } = {}) {
    super();
    this.props = { model, title, color, controls, handlers };
  }

  connectedCallback() {
    if (this.childElementCount) return;
    this.classList.add("unit", "engine");
    this.style.setProperty("--engine-accent", this.props.color);
    this.setAttribute("aria-label", `${this.props.title}: ${this.props.model}`);
    if (typeof this.props.handlers.click === "function") {
      this.setAttribute("role", "button");
      this.tabIndex = 0;
    }
    this.render();
    for (const [eventName, handler] of Object.entries(this.props.handlers)) {
      if (eventName === "modelClick") continue;
      if (typeof handler === "function") {
        this.addEventListener(eventName, (event) => {
          if (event.target.closest?.(".model-name")) return;
          handler(event);
        });
      }
    }
    const modelButton = this.querySelector(".model-name");
    if (typeof this.props.handlers.modelClick === "function") {
      modelButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        this.props.handlers.modelClick(event);
      });
      modelButton.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") event.stopPropagation();
      });
    }
  }

  render() {
    const controls = this.props.controls.map(({ label, value }) => this.createElement("div", {
      class: "dial",
      title: `${label}: ${value}`,
      children: [
        this.createElement("div", { class: "dial-scale", "aria-hidden": "true", children: [
          //this.createElement("span", { class: "scale-mark scale-left", textContent: "·" }),
          //this.createElement("span", { class: "scale-mark scale-top", textContent: value }),
          //this.createElement("span", { class: "scale-mark scale-right", textContent: "·" }),
          this.createElement("i", { class: "knob" }),
        ] }),
        this.createElement("span", { textContent: label }),
      ],
    }));
    this.appendChildren(this, [
      this.createElement("i", { class: "handle", "aria-hidden": "true" }),
      ...["tl", "tr", "bl", "br"].map((corner) => this.createElement("i", {
        class: `engine-corner engine-corner-${corner}`,
        "aria-hidden": "true",
      })),
      this.createElement("div", { class: "engine-title", textContent: this.props.title }),
      this.createElement("div", { class: "control-face", children: controls }),
      this.createElement("div", { class: "model", children: [
        this.createElement("i", { class: "power", "aria-hidden": "true" }),
          this.createElement("button", { class: "model-name", type: "button", textContent: this.props.model }),
        ] 
      }),
      this.createElement("i", { class: "engine-foot engine-foot-left", "aria-hidden": "true" }),
      this.createElement("i", { class: "engine-foot engine-foot-right", "aria-hidden": "true" }),
    ]);
  }

  setModel(model) {
    const value = String(model || "Unknown model").trim();
    this.props.model = value;
    this.querySelector(".model-name").textContent = value;
    this.setAttribute("aria-label", `${this.props.title}: ${value}`);
    this.title = `Current model: ${value}`;
  }
}

customElements.define("model-engine", ModelEngine);
export { DEFAULT_CONTROLS };
export default ModelEngine;
