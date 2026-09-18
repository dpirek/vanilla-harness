import BaseComponent from "./base-component.js";

class ModelsPage extends BaseComponent {
  connectedCallback() {
    if (this.childElementCount) return;
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
      ["rating", "Rating"],
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
        element("div", { class: "providerModelsHeading", children: [element("span", { id: "allProviderModelsStatus", children: [text("Models are cached in SQLite.")] })] }),
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

    this.appendChildren(this, [modelsSection]);
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
