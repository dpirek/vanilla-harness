import BaseComponent from "../base-component.js";

class SystemPromptsModal extends BaseComponent {
  connectedCallback() {
    if (this.childElementCount) return;
    this.style.display = "contents";
    this.render();
  }

  render() {
    this.appendChildren(this, [
      this.createElement("dialog", { "id": "systemPromptsDialog", "class": "settingsDialog", children: [this.createElement("form", { "id": "systemPromptsForm", "class": "settingsPanel", children: [this.createElement("header", { "class": "settingsHeader", children: [this.createElement("div", { children: [this.createElement("h2", { children: [document.createTextNode("System prompts")] }), this.createElement("p", { children: [document.createTextNode("Configure the instructions used for new agent sessions")] })] }), this.createElement("button", { "id": "closeSystemPromptsButton", "class": "iconButton", "type": "button", "aria-label": "Close system prompts", children: [document.createTextNode("×")] })] }), this.createElement("section", { "id": "systemPromptsList", "class": "systemPromptsList" }), this.createElement("section", { "id": "systemPromptEditor", "class": "systemPromptEditor", "hidden": "", children: [this.createElement("label", { children: [this.createElement("span", { "id": "systemPromptEditorTitle", children: [document.createTextNode("Prompt")] }), this.createElement("textarea", { "id": "systemPromptContent", "class": "configInput", "spellcheck": "false" })] })] }), this.createElement("footer", { "class": "settingsFooter", children: [this.createElement("span", { "id": "systemPromptsStatus", "class": "configStatus", children: [document.createTextNode("Defaults are stored in SQLite.")] }), this.createElement("div", { children: [this.createElement("button", { "id": "saveSystemPromptButton", "class": "primaryButton", "type": "submit", "hidden": "", children: [document.createTextNode("Save prompt")] })] })] })] })] })
    ]);
    const dialog = this.querySelector("dialog");
    this.querySelector("#closeSystemPromptsButton").addEventListener("click", () => dialog.close());
    this.querySelector("form").addEventListener("submit", (event) => { event.preventDefault(); this.emit("save-system-prompt"); });
  }
}

customElements.define("system-prompts-modal", SystemPromptsModal);

export default SystemPromptsModal;
