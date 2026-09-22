import { bootstrapIcon } from "../../lib/icons.js";
import BaseComponent from "../base-component.js";

class SkillsModal extends BaseComponent {
  connectedCallback() {
    if (this.childElementCount) return;
    this.style.display = "contents";
    this.render();
  }

  render() {
    const element = (tag, props = {}) => this.createElement(tag, props);
    const text = (value) => document.createTextNode(value);
    this.appendChildren(this, [
      element("dialog", { id: "skillsDialog", class: "settingsDialog skillsDialog", children: [
        element("form", { id: "skillsForm", class: "settingsPanel", method: "dialog", children: [
          element("header", { class: "settingsHeader", children: [
            element("div", { class: "skillModalIdentity", children: [
              element("button", { id: "backToSkillsButton", class: "iconButton", type: "button", hidden: "", "aria-label": "Back to skills", children: [bootstrapIcon("arrow-left")] }),
              element("div", { children: [
                element("h2", { id: "skillsDialogTitle", children: [text("Skills")] }),
                element("p", { id: "skillsDialogDescription", children: [text("Choose how skills load for this preset.")] }),
              ] }),
            ] }),
            element("div", { class: "settingsHeaderActions", children: [
              element("button", { id: "closeSkillsButton", class: "iconButton", type: "button", "aria-label": "Close skills", children: [bootstrapIcon("x-lg")] }),
            ] }),
          ] }),
          element("div", { class: "skillDiscoverySetting", children: [
            element("span", { class: "skillDiscoveryCopy", children: [
              element("strong", { children: [text("Auto-discover skills")] }),
              element("small", { children: [text("Suggest relevant skill guides from /skills during a run.")] }),
            ] }),
            element("button", { id: "skillAutoDiscoveryToggle", class: "skillDiscoveryButton", type: "button", "aria-pressed": "true", "aria-label": "Turn off skill auto-discovery", children: [bootstrapIcon("stars"), element("span", { children: [text("On")] })] }),
          ] }),
          element("section", { class: "skillLibrary", "aria-label": "Skill library", children: [
            element("div", { class: "skillLibraryHeader", children: [
              element("div", { children: [
                element("h3", { children: [text("Skill library")] }),
                element("p", { children: [text("Starred skills load every turn. Other skills are available when auto-discovery is on.")] }),
              ] }),
              element("div", { class: "skillLibraryActions", children: [
                element("label", { class: "skillSearch", children: [
                  element("input", { id: "skillsSearchInput", type: "search", placeholder: "Search skills", autocomplete: "off", "aria-label": "Search skills" }),
                ] }),
                element("button", { id: "addSkillButton", class: "skillToolbarIcon", type: "button", title: "Add skill", "aria-label": "Add skill", children: [bootstrapIcon("plus-lg")] }),
                element("button", { id: "importSkillButton", class: "skillToolbarIcon", type: "button", title: "Import skill folder", "aria-label": "Import skill folder", children: [bootstrapIcon("folder-plus")] }),
                element("input", { id: "importSkillInput", type: "file", webkitdirectory: "", multiple: "", hidden: "" }),
              ] }),
            ] }),
            element("div", { class: "skillTableWrap", children: [
              element("table", { class: "skillTable", children: [
                element("thead", { children: [element("tr", { children: [
                  element("th", { scope: "col", children: [text("Skill")] }),
                  element("th", { class: "skillToggleColumn", scope: "col", children: [text("Loading mode")] }),
                  element("th", { class: "skillActionColumn", scope: "col", children: [text("Actions")] }),
                ] })] }),
                element("tbody", { id: "skillsTableBody" }),
              ] }),
            ] }),
          ] }),
          element("section", { id: "skillEditor", class: "skillEditor", hidden: "", "aria-label": "Skill editor", children: [
            element("label", { class: "skillEditorField", children: [
              element("span", { children: [text("Skill name")] }),
              element("input", { id: "skillEditorName", type: "text", required: "", disabled: "", maxlength: "63", spellcheck: "false", placeholder: "review-pull-request" }),
              element("small", { children: [text("Use lowercase letters, numbers, and hyphens.")] }),
            ] }),
            element("label", { class: "skillEditorField skillContentField", children: [
              element("span", { children: [text("SKILL.md")] }),
              element("textarea", { id: "skillEditorContent", required: "", disabled: "", spellcheck: "false", "aria-describedby": "skillEditorHelp" }),
              element("small", { id: "skillEditorHelp", children: [text("Include YAML frontmatter with name and description, followed by concise Markdown instructions.")] }),
            ] }),
            element("section", { id: "skillResourcesSection", class: "skillResourcesSection", hidden: "", children: [
              element("h3", { children: [text("Supporting files")] }),
              element("p", { children: [text("Edit files in scripts/, references/, templates/, examples/, assets/, or agents/. Save SKILL.md before adding files.")] }),
              element("div", { id: "skillResourceList", class: "skillResourceList" }),
              element("label", { class: "skillEditorField", children: [
                element("span", { children: [text("Resource path")] }),
                element("input", { id: "skillResourcePath", type: "text", placeholder: "examples/example.md" }),
              ] }),
              element("label", { class: "skillEditorField", children: [
                element("span", { children: [text("Resource content")] }),
                element("textarea", { id: "skillResourceContent", spellcheck: "false" }),
              ] }),
              element("div", { class: "skillResourceActions", children: [
                element("button", { id: "saveSkillResourceButton", type: "button", children: [text("Save file")] }),
                element("button", { id: "testSkillButton", type: "button", children: [text("Test skill")] }),
              ] }),
              element("pre", { id: "skillTestResults", class: "skillTestResults", tabindex: "0" }),
            ] }),
          ] }),
          element("footer", { class: "settingsFooter", children: [
            element("span", { id: "skillsStatus", class: "configStatus", children: [text("Skills are stored in /skills.")] }),
            element("div", { class: "skillFooterActions", children: [
              element("button", { id: "cancelSkillEditButton", type: "button", hidden: "", children: [text("Cancel")] }),
              element("button", { id: "saveSkillEditButton", class: "primaryButton", type: "submit", hidden: "", children: [text("Create skill")] }),
              element("button", { id: "saveSkillsButton", class: "primaryButton", type: "submit", children: [text("Save selection")] }),
            ] }),
          ] }),
        ] }),
      ] }),
    ]);

    const dialog = this.querySelector("dialog");
    this.querySelector("#closeSkillsButton").addEventListener("click", () => dialog.close());
    this.querySelector("#skillsSearchInput").addEventListener("input", () => this.emit("search-skills"));
    this.querySelector("#skillAutoDiscoveryToggle").addEventListener("click", () => this.emit("change-skill-discovery"));
    this.querySelector("#addSkillButton").addEventListener("click", () => this.emit("create-skill"));
    this.querySelector("#importSkillButton").addEventListener("click", () => this.querySelector("#importSkillInput").click());
    this.querySelector("#importSkillInput").addEventListener("change", () => this.emit("import-skill"));
    this.querySelector("#saveSkillResourceButton").addEventListener("click", () => this.emit("save-skill-resource"));
    this.querySelector("#testSkillButton").addEventListener("click", () => this.emit("test-skill"));
    this.querySelector("#backToSkillsButton").addEventListener("click", () => this.emit("cancel-skill-edit"));
    this.querySelector("#cancelSkillEditButton").addEventListener("click", () => this.emit("cancel-skill-edit"));
    this.querySelector("form").addEventListener("submit", (event) => {
      event.preventDefault();
      this.emit(this.querySelector("#skillEditor").hidden ? "save-skills" : "save-skill-edit");
    });
    dialog.addEventListener("close", () => this.emit("cancel-skill-edit"));
  }
}

customElements.define("skills-modal", SkillsModal);

export default SkillsModal;
