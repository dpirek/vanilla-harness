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
            element("div", { children: [
              element("h2", { children: [text("Skills")] }),
              element("p", { children: [text("Choose which SKILL.md guides are injected into new agent sessions")] }),
            ] }),
            element("div", { class: "settingsHeaderActions", children: [
              element("button", { id: "toggleSkillColumnButton", class: "iconButton", type: "button", "aria-label": "Hide skill column", "aria-pressed": "true", title: "Hide skill column", children: [text("☷")] }),
              element("button", { id: "closeSkillsButton", class: "iconButton", type: "button", "aria-label": "Close skills", children: [text("×")] }),
            ] }),
          ] }),
          element("section", { class: "skillLibrary", "aria-label": "Skill library", children: [
            element("div", { class: "skillLibraryHeader", children: [
              element("div", { children: [
                element("h3", { children: [text("Installed Skills")] }),
                element("p", { children: [text("Imported from local SKILL.md files and stored in SQLite.")] }),
              ] }),
              element("label", { class: "skillSearch", children: [
                element("input", { id: "skillsSearchInput", type: "search", placeholder: "Search skills", autocomplete: "off", "aria-label": "Search skills" }),
              ] }),
            ] }),
            element("div", { class: "skillTableWrap", children: [
              element("table", { class: "skillTable", children: [
                element("thead", { children: [element("tr", { children: [
                  element("th", { scope: "col", children: [text("Name")] }),
                  element("th", { scope: "col", children: [text("Source")] }),
                  element("th", { scope: "col", children: [text("Skills")] }),
                ] })] }),
                element("tbody", { id: "skillsTableBody" }),
              ] }),
            ] }),
          ] }),
          element("footer", { class: "settingsFooter", children: [
            element("span", { id: "skillsStatus", class: "configStatus", children: [text("Skill selections are stored in SQLite.")] }),
            element("div", { children: [element("button", { id: "saveSkillsButton", class: "primaryButton", type: "submit", children: [text("Save skills")] })] }),
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
    toggleSkillColumnButton.addEventListener("click", () => {
      dialog.classList.toggle("skill-column-hidden");
      updateSkillColumnButton();
    });
    this.querySelector("form").addEventListener("submit", (event) => { event.preventDefault(); this.emit("save-skills"); });
    updateSkillColumnButton();
  }
}

customElements.define("skills-modal", SkillsModal);

export default SkillsModal;
