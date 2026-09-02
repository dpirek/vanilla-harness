class AiHarnessApp extends HTMLElement {
  get theme() {
    return this.getAttribute("theme") === "light" ? "light" : "dark";
  }

  set theme(value) {
    const normalized = String(value || "dark").trim().toLocaleLowerCase();
    if (!["dark", "light"].includes(normalized)) {
      throw new TypeError('ai-harness-app theme must be "dark" or "light".');
    }
    this.setAttribute("theme", normalized);
  }

  get hideLeftColumn() {
    return this.hasAttribute("hide-left-column");
  }

  set hideLeftColumn(value) {
    this.toggleAttribute("hide-left-column", Boolean(value));
  }

  get hideRightColumn() {
    return this.hasAttribute("hide-right-column");
  }

  set hideRightColumn(value) {
    this.toggleAttribute("hide-right-column", Boolean(value));
  }

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: "open" });
    const stylesheet = document.createElement("link");
    stylesheet.rel = "stylesheet";
    stylesheet.href = "/styles.css";
    const shell = document.createElement("div");
    shell.id = "appShell";
    shell.className = "app files-collapsed";
    shadow.append(stylesheet, shell);
  }

  connectedCallback() {
    if (this.dataset.started === "true") return;
    this.dataset.started = "true";
    import("../app.js")
      .then(() => this.dispatchEvent(new CustomEvent("harness-load")))
      .catch((error) => {
        this.dataset.started = "false";
        this.shadowRoot.querySelector("#appShell").textContent = `Unable to load AI Harness: ${error.message}`;
      });
  }
}

if (!customElements.get("ai-harness-app")) {
  customElements.define("ai-harness-app", AiHarnessApp);
}

export default AiHarnessApp;
