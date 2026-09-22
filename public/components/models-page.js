import { bootstrapIcon } from "../lib/icons.js";
import BaseComponent from "./base-component.js";

class ModelsPage extends BaseComponent {
  connectedCallback() {
    if (this.childElementCount) return;
    this.style.display = "contents";
    const element = (tag, attributes = {}) => this.createElement(tag, attributes);
    const text = (value) => document.createTextNode(value);
    const button = (id, label, attributes = {}) => element("button", {
      id, type: "button", ...attributes, children: [text(label)],
    });
    const modelColumns = [
      ["model", "Model"],
      ["providers", "Providers"],
      ["tools", "Tools"],
      ["throughput", "Throughput"],
      ["latency", "Latency"],
      ["context", "Context"],
      ["inputCost", "Input / 1M"],
      ["outputCost", "Output / 1M"],
    ];
    const modelsTable = element("table", { class: "providerTable providerModelsTable", children: [
      element("thead", { children: [element("tr", { children: [...modelColumns.map(([key, label]) =>
        element("th", {
          "aria-sort": key === "model" ? "ascending" : "none",
          children: [element("button", {
            type: "button",
            class: "providerModelsSortButton",
            "data-provider-model-sort": key,
            "data-direction": key === "model" ? "asc" : "",
            children: [text(label)],
          })],
        })), element("th", { children: [text("Actions")], "aria-label": "Use or test model" })] })] }),
      element("tbody", { id: "providerModelsTableBody" }),
    ] });
    const modelsSection = element("section", { id: "providerModelsSection", class: "providerModelsSection", "aria-label": "Models", children: [
      element("div", { class: "providerTableToolbar", children: [
        element("strong", { children: [text("Model catalog")] }),
        element("div", { class: "providerModelsControls", children: [
          element("select", { id: "providerModelsFilter", "aria-label": "Filter models by provider", children: [
            element("option", { value: "", textContent: "All providers" }),
          ] }),
          element("input", { id: "providerModelsSearch", type: "search", placeholder: "Search models or providers", "aria-label": "Search models or providers" }),
          button("refreshAllProviderModelsButton", "Refresh models"),
        ] }),
      ] }),
      element("div", { class: "providerTableWrap", children: [modelsTable] }),
    ] });

    this.appendChildren(this, [element("dialog", { id: "modelsDialog", class: "settingsDialog modelsDialog", children: [
      element("div", { class: "settingsPanel", children: [
        element("header", { class: "settingsHeader", children: [
          element("div", { children: [element("h2", { children: [text("Models")] }), element("p", { children: [text("Browse and select a model from your providers")] })] }),
          element("button", { id: "closeModelsButton", class: "iconButton", type: "button", "aria-label": "Close models", children: [bootstrapIcon("x-lg")] }),
        ] }),
        modelsSection,
        element("footer", { class: "settingsFooter", children: [element("span", { id: "allProviderModelsStatus", class: "configStatus", children: [text("Models are cached in SQLite.")] })] }),
      ] }),
    ] })]);
    this.querySelector("#closeModelsButton").addEventListener("click", () => this.querySelector("#modelsDialog").close());
    this.querySelector("#refreshAllProviderModelsButton").addEventListener("click", () => this.emit("refresh-all-provider-models"));
    this.querySelector("#providerModelsSearch").addEventListener("input", (event) => this.emit("provider-model-search", { query: event.target.value }));
    this.querySelector("#providerModelsFilter").addEventListener("change", (event) => this.emit("provider-model-filter", { providerId: event.target.value }));
    for (const sortButton of this.querySelectorAll("[data-provider-model-sort]")) {
      sortButton.addEventListener("click", () => this.emit("provider-model-sort", { key: sortButton.dataset.providerModelSort }));
    }
  }
}

customElements.define("models-page", ModelsPage);
export default ModelsPage;
