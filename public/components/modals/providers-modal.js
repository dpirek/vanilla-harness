import { bootstrapIcon } from "../../lib/icons.js";
import BaseComponent from "../base-component.js";

class ProvidersModal extends BaseComponent {
  connectedCallback() {
    if (this.childElementCount) return;
    this.style.display = "contents";
    this.render();
  }

  render() {
    const element = (tag, attributes = {}) => this.createElement(tag, attributes);
    const text = (value) => document.createTextNode(value);
    const button = (id, label, attributes = {}) => element("button", {
      id, type: "button", ...attributes, children: [typeof label === "string" ? text(label) : label],
    });
    const providersTable = element("table", { class: "providerTable", children: [
      element("thead", { children: [element("tr", { children: ["Use", "Name", "Type", "Model", "API key", ""].map((label) =>
        element("th", { children: label ? [text(label)] : [] })) })] }),
      element("tbody", { id: "providersTableBody" }),
    ] });
    const providerEditor = element("div", { id: "providerEditor", class: "providerEditor", hidden: "", children: [
      element("label", { children: [element("span", { children: [text("Name")] }), element("input", { id: "providerNameInput", type: "text", placeholder: "My OpenAI" })] }),
      element("label", { children: [element("span", { children: [text("Type")] }), element("select", { id: "providerSelect", children: [
        element("option", { value: "openai", children: [text("OpenAI")] }),
        element("option", { value: "ollama", children: [text("Ollama")] }),
        element("option", { value: "custom", children: [text("Custom")] }),
      ] })] }),
      element("label", { children: [element("span", { children: [text("Model")] }), element("select", { id: "providerModelInput" })] }),
      element("label", { children: [element("span", { children: [text("Base URL")] }), element("input", { id: "providerBaseUrlInput", type: "url", placeholder: "http://localhost:11434" })] }),
      element("label", { id: "providerApiKeyField", children: [element("span", { children: [text("API key")] }), element("input", { id: "providerApiKeyInput", type: "password", autocomplete: "off", placeholder: "Optional bearer token" })] }),
      element("div", { class: "providerModelActions", children: [button("refreshModelsButton", "Refresh models"), element("span", { id: "providerModelsStatus", children: [text("Models not loaded")] })] }),
    ] });
    const providerSettings = element("section", { id: "providerSettings", class: "providerSettings providerTabPanel", children: [
      element("div", { class: "providerTableToolbar", children: [element("strong", { children: [text("Providers")] }), button("addProviderButton", "Add provider")] }),
      element("div", { class: "providerTableWrap", children: [providersTable] }),
      providerEditor,
    ] });

    this.appendChildren(this, [element("dialog", { id: "settingsDialog", class: "settingsDialog", children: [
      element("form", { id: "settingsForm", class: "settingsPanel", method: "dialog", children: [
        element("header", { class: "settingsHeader", children: [
          element("div", { children: [element("h2", { children: [text("Providers")] }), element("p", { children: [text("Manage AI providers and credentials")] })] }),
          button("closeSettingsButton", bootstrapIcon("x-lg"), { class: "iconButton", "aria-label": "Close providers" }),
        ] }),
        element("div", { class: "providerTabContent", children: [providerSettings] }),
        element("footer", { class: "settingsFooter", children: [
          element("span", { id: "settingsStatus", class: "configStatus", children: [text("Provider settings are stored in SQLite.")] }),
          element("div", { children: [button("saveSettingsButton", "Save", { class: "primaryButton", type: "submit" })] }),
        ] }),
      ] }),
    ] })]);

    const dialog = this.querySelector("dialog");
    this.querySelector("#closeSettingsButton").addEventListener("click", () => dialog.close());
    this.querySelector("form").addEventListener("submit", (event) => { event.preventDefault(); this.emit("save-provider-settings"); });
    this.querySelector("#addProviderButton").addEventListener("click", () => this.emit("add-provider"));
    this.querySelector("#refreshModelsButton").addEventListener("click", () => this.emit("refresh-provider-models"));
    this.querySelector("#providerSelect").addEventListener("change", () => this.emit("provider-type-change"));
    this.querySelector("#providerBaseUrlInput").addEventListener("change", () => this.emit("refresh-provider-models"));
  }
}

customElements.define("providers-modal", ProvidersModal);

export default ProvidersModal;
