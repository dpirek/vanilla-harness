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
      element("dialog", { id: "skillsDialog", class: "settingsDialog", children: [
        element("form", { id: "skillsForm", class: "settingsPanel", method: "dialog", children: [
          element("header", { class: "settingsHeader", children: [
            element("div", { class: "skillModalIdentity", children: [
              element("button", { id: "backToSkillsButton", class: "iconButton", type: "button", hidden: "", "aria-label": "Back to skills", children: [text("←")] }),
              element("div", { children: [
                element("h2", { id: "skillsDialogTitle", children: [text("Skills")] }),
                element("p", { id: "skillsDialogDescription", children: [text("Choose which SKILL.md guides are injected into new agent sessions")] }),
              ] }),
            ] }),
            element("div", { class: "settingsHeaderActions", children: [
              element("button", { id: "toggleSkillColumnButton", class: "iconButton", type: "button", "aria-label": "Hide skill column", "aria-pressed": "true", title: "Hide skill column", children: [text("☷")] }),
              element("button", { id: "closeSkillsButton", class: "iconButton", type: "button", "aria-label": "Close skills", children: [text("×")] }),
            ] }),
          ] }),
          element("section", { class: "skillLibrary", "aria-label": "Skill library", children: [
            element("div", { class: "skillLibraryHeader", children: [
              element("div", { children: [
                element("h3", { children: [text("Stored skills")] }),
                element("p", { children: [text("Skill definitions are stored exclusively in SQLite.")] }),
              ] }),
              element("div", { class: "skillLibraryActions", children: [
                element("label", { class: "skillSearch", children: [
                  element("input", { id: "skillsSearchInput", type: "search", placeholder: "Search skills", autocomplete: "off", "aria-label": "Search skills" }),
                ] }),
                element("button", { id: "addSkillButton", class: "primaryButton", type: "button", children: [text("Add new")] }),
              ] }),
            ] }),
            element("div", { class: "skillTableWrap", children: [
              element("table", { class: "skillTable", children: [
                element("thead", { children: [element("tr", { children: [
                  element("th", { scope: "col", children: [text("Name")] }),
                  element("th", { class: "skillToggleColumn", scope: "col", children: [text("Enabled")] }),
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
          ] }),
          element("footer", { class: "settingsFooter", children: [
            element("span", { id: "skillsStatus", class: "configStatus", children: [text("Skill selections are stored in SQLite.")] }),
            element("div", { class: "skillFooterActions", children: [
              element("button", { id: "cancelSkillEditButton", type: "button", hidden: "", children: [text("Cancel")] }),
              element("button", { id: "saveSkillEditButton", class: "primaryButton", type: "submit", hidden: "", children: [text("Create skill")] }),
              element("button", { id: "saveSkillsButton", class: "primaryButton", type: "submit", children: [text("Save skills")] }),
            ] }),
          ] }),
        ] }),
      ] }),
    ]);

    const dialog = this.querySelector("dialog");
    const toggleSkillColumnButton = this.querySelector("#toggleSkillColumnButton");
    const updateSkillColumnButton = () => {
      const visible = !dialog.classList.contains("skill-column-hidden");
      toggleSkillColumnButton.setAttribute("aria-pressed", String(visible));
      toggleSkillColumnButton.setAttribute("aria-label", `${visible ? "Hide" : "Show"} skill column`);
      toggleSkillColumnButton.title = `${visible ? "Hide" : "Show"} skill column`;
    };
    this.querySelector("#closeSkillsButton").addEventListener("click", () => dialog.close());
    this.querySelector("#skillsSearchInput").addEventListener("input", () => this.emit("search-skills"));
    this.querySelector("#addSkillButton").addEventListener("click", () => this.emit("create-skill"));
    this.querySelector("#backToSkillsButton").addEventListener("click", () => this.emit("cancel-skill-edit"));
    this.querySelector("#cancelSkillEditButton").addEventListener("click", () => this.emit("cancel-skill-edit"));
    toggleSkillColumnButton.addEventListener("click", () => {
      dialog.classList.toggle("skill-column-hidden");
      updateSkillColumnButton();
    });
    this.querySelector("form").addEventListener("submit", (event) => {
      event.preventDefault();
      this.emit(this.querySelector("#skillEditor").hidden ? "save-skills" : "save-skill-edit");
    });
    dialog.addEventListener("close", () => this.emit("cancel-skill-edit"));
    updateSkillColumnButton();
  }
}

customElements.define("skills-modal", SkillsModal);

export default SkillsModal;
