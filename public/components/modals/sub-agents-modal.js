import BaseComponent from "../base-component.js";

class SubAgentsModal extends BaseComponent {
  connectedCallback() {
    if (this.childElementCount) return;
    this.style.display = "contents";
    this.render();
  }

  render() {
    const element = (tag, props = {}) => this.createElement(tag, props);
    const text = (value) => document.createTextNode(value);
    const dialog = element("dialog", { id: "subAgentsDialog", class: "settingsDialog", children: [
      element("form", { id: "subAgentsForm", class: "settingsPanel", method: "dialog", children: [
        element("header", { class: "settingsHeader", children: [
          element("div", { children: [
            element("h2", { children: [text("Sub-agents")] }),
            element("p", { id: "subAgentsDialogDescription", children: [text("Configure asynchronous Agent Workers for the active preset")] }),
          ] }),
          element("button", { id: "closeSubAgentsButton", class: "iconButton", type: "button", "aria-label": "Close sub-agent configuration", children: [text("×")] }),
        ] }),
        element("div", { class: "providerTableToolbar", children: [
          element("strong", { children: [text("Configured workers")] }),
          element("button", { id: "showAddSubAgentButton", type: "button", children: [text("Add worker")] }),
        ] }),
        element("section", { id: "subAgentEditor", class: "toolsAddPanel subAgentEditor", hidden: "", children: [
          element("strong", { children: [text("Add Agent Worker")] }),
          element("label", { children: [
            element("span", { children: [text("Name")] }),
            element("input", { id: "subAgentNameInput", type: "text", maxlength: "64", spellcheck: "false", placeholder: "reviewer" }),
          ] }),
          element("label", { children: [
            element("span", { children: [text("Worker URL")] }),
            element("input", { id: "subAgentUrlInput", type: "url", spellcheck: "false", placeholder: "http://localhost:3001" }),
          ] }),
          element("div", { class: "mcpEditorActions", children: [
            element("button", { id: "cancelSubAgentEditorButton", type: "button", children: [text("Cancel")] }),
            element("button", { id: "addSubAgentButton", class: "primaryButton", type: "button", children: [text("Add worker")] }),
          ] }),
        ] }),
        element("section", { class: "subAgentListPanel", "aria-label": "Configured Agent Workers", children: [
          element("div", { class: "subAgentListHeader", children: [
            element("span", { children: [text("Name")] }),
            element("span", { children: [text("Worker URL")] }),
            element("span", { children: [text("Actions")] }),
          ] }),
          element("div", { id: "subAgentsList", class: "subAgentsList" }),
        ] }),
        element("footer", { class: "settingsFooter", children: [
          element("span", { id: "subAgentsStatus", class: "configStatus", children: [text("Workers are stored in the active preset.")] }),
          element("button", { id: "saveSubAgentsButton", class: "primaryButton", type: "submit", children: [text("Save sub-agents")] }),
        ] }),
      ] }),
    ] });

    this.appendChildren(this, [dialog]);
    this.querySelector("#closeSubAgentsButton").addEventListener("click", () => dialog.close());
    this.querySelector("#showAddSubAgentButton").addEventListener("click", () => this.emit("show-sub-agent-editor"));
    this.querySelector("#cancelSubAgentEditorButton").addEventListener("click", () => this.emit("cancel-sub-agent-editor"));
    this.querySelector("#addSubAgentButton").addEventListener("click", () => this.emit("add-sub-agent"));
    this.querySelector("form").addEventListener("submit", (event) => {
      event.preventDefault();
      this.emit("save-sub-agents");
    });
  }
}

customElements.define("sub-agents-modal", SubAgentsModal);

export default SubAgentsModal;
