import BaseComponent from "../base-component.js";

class SkillsModal extends BaseComponent {
  connectedCallback() {
    if (this.childElementCount) return;
    this.style.display = "contents";
    this.render();
  }

  render() {
    this.appendChildren(this, [
      this.createElement("dialog", { "id": "skillsDialog", "class": "settingsDialog", children: [this.createElement("form", { "id": "skillsForm", "class": "settingsPanel", "method": "dialog", children: [this.createElement("header", { "class": "settingsHeader", children: [this.createElement("div", { children: [this.createElement("h2", { children: [document.createTextNode("Skills")] }), this.createElement("p", { children: [document.createTextNode("Choose which SKILL.md guides are injected into new agent sessions")] })] }), this.createElement("div", { "class": "settingsHeaderActions", children: [this.createElement("button", { "id": "toggleSkillColumnButton", "class": "iconButton", "type": "button", "aria-label": "Hide skill column", "aria-pressed": "true", "title": "Hide skill column", children: [document.createTextNode("☷")] }), this.createElement("button", { "id": "closeSkillsButton", "class": "iconButton", "type": "button", "aria-label": "Close skills", children: [document.createTextNode("×")] })] })] }), this.createElement("section", { "class": "skillLibrary", "aria-label": "Skill library", children: [this.createElement("div", { "class": "skillLibraryHeader", children: [this.createElement("h3", { children: [document.createTextNode("Installed Skills")] }), this.createElement("p", { children: [document.createTextNode("Imported from local SKILL.md files and stored in SQLite.")] })] }), this.createElement("div", { "class": "skillTableWrap", children: [this.createElement("table", { "class": "skillTable", children: [this.createElement("thead", { children: [this.createElement("tr", { children: [this.createElement("th", { "scope": "col", children: [document.createTextNode("Name")] }), this.createElement("th", { "scope": "col", children: [document.createTextNode("Source")] }), this.createElement("th", { "scope": "col", children: [document.createTextNode("Skills")] })] })] }), this.createElement("tbody", { "id": "skillsTableBody" })] })] })] }), this.createElement("footer", { "class": "settingsFooter", children: [this.createElement("span", { "id": "skillsStatus", "class": "configStatus", children: [document.createTextNode("Skill selections are stored in SQLite.")] }), this.createElement("div", { children: [this.createElement("button", { "id": "saveSkillsButton", "class": "primaryButton", "type": "submit", children: [document.createTextNode("Save skills")] })] })] })] })] })
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
