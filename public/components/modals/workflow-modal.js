import BaseComponent from "../base-component.js";

const WORKFLOW_STEPS = [
  { key: "composer", label: "Composer", description: "Refine input", x: 18 },
  { key: "tools", label: "Tools", description: "Run local tools", x: 245 },
  { key: "mcp", label: "MCP", description: "Call MCP servers", x: 472 },
  { key: "validation", label: "Validation", description: "Verify changes", x: 699 },
];

class WorkflowModal extends BaseComponent {
  connectedCallback() {
    if (this.childElementCount) return;
    this.style.display = "contents";
    this.render();
  }

  stepGroup(step, index) {
    return this.createElement("g", {
      class: "workflowStep",
      transform: `translate(${step.x} 30)`,
      tabindex: "0",
      role: "checkbox",
      "aria-label": `${step.label} workflow step`,
      "aria-checked": "true",
      "data-workflow-step": step.key,
      children: [
        this.createElement("rect", { class: "workflowStepCard", x: "0", y: "0", width: "188", height: "120", rx: "12" }),
        this.createElement("circle", { class: "workflowStepNumber", cx: "24", cy: "25", r: "13" }),
        this.createElement("text", { class: "workflowStepNumberText", x: "24", y: "29", "text-anchor": "middle", textContent: String(index + 1).padStart(2, "0") }),
        this.createElement("text", { class: "workflowStepTitle", x: "47", y: "28", textContent: step.label }),
        this.createElement("text", { class: "workflowStepDescription", x: "18", y: "65", textContent: step.description }),
        this.createElement("circle", { class: "workflowStepStateDot", cx: "23", cy: "96", r: "5" }),
        this.createElement("text", { class: "workflowStepStateText", x: "36", y: "100", textContent: "Enabled" }),
      ],
    });
  }

  connector(from, to) {
    const start = from.x + 188;
    const end = to.x;
    const padding = 6;
    const arrowLength = 10;
    const arrowBase = end - padding - arrowLength;
    const arrowTip = end - padding;
    return this.createElement("g", {
      class: "workflowConnector",
      "data-workflow-from": from.key,
      "data-workflow-to": to.key,
      children: [
        this.createElement("line", { x1: String(start + padding), y1: "90", x2: String(arrowBase), y2: "90" }),
        this.createElement("path", { d: `M ${arrowBase} 84 L ${arrowTip} 90 L ${arrowBase} 96 Z` }),
      ],
    });
  }

  render() {
    const connectors = WORKFLOW_STEPS.slice(0, -1).map((step, index) => this.connector(step, WORKFLOW_STEPS[index + 1]));
    const steps = WORKFLOW_STEPS.map((step, index) => this.stepGroup(step, index));
    const dialog = this.createElement("dialog", {
      id: "workflowDialog",
      class: "settingsDialog workflowDialog",
      children: [this.createElement("form", {
        id: "workflowForm",
        class: "settingsPanel workflowPanel",
        children: [
          this.createElement("header", { class: "settingsHeader", children: [
            this.createElement("div", { children: [
              this.createElement("h2", { textContent: "Workflow configuration" }),
              this.createElement("p", { id: "workflowDialogDescription", textContent: "Configure the active preset's processing stages" }),
            ] }),
            this.createElement("button", { id: "closeWorkflowButton", class: "iconButton", type: "button", "aria-label": "Close workflow configuration", textContent: "×" }),
          ] }),
          this.createElement("section", { class: "workflowDiagramPanel", children: [
            this.createElement("div", { class: "workflowDiagramHeading", children: [
              this.createElement("div", { children: [
                this.createElement("h3", { textContent: "Agent workflow" }),
                this.createElement("p", { textContent: "Select a step in the diagram or use the controls below." }),
              ] }),
              this.createElement("span", { id: "workflowEnabledCount", class: "workflowEnabledCount", textContent: "4 of 4 enabled" }),
            ] }),
            this.createElement("div", { class: "workflowDiagramScroll", children: [
              this.createElement("svg", {
                id: "workflowDiagram",
                class: "workflowDiagram",
                viewBox: "0 0 905 180",
                role: "img",
                "aria-label": "Workflow from Composer through Tools and MCP to Validation",
                children: [...connectors, ...steps],
              }),
            ] }),
          ] }),
          this.createElement("div", { hidden: "", children: [
            this.createElement("select", { id: "workflowInputSource", children: [
              this.createElement("option", { value: "microphone", textContent: "Microphone" }),
              this.createElement("option", { value: "keyboard", textContent: "Keyboard" }),
            ] }),
            ...WORKFLOW_STEPS.map((step) => this.createElement("input", {
              id: `workflowEffect${step.label}`,
              type: "checkbox",
              "data-workflow-effect": step.key,
            })),
          ] }),
          this.createElement("footer", { class: "settingsFooter", children: [
            this.createElement("span", { id: "workflowStatus", class: "configStatus", role: "status", textContent: "Workflow settings are stored in the active preset." }),
            this.createElement("div", { children: [
              this.createElement("button", { id: "cancelWorkflowButton", type: "button", textContent: "Cancel" }),
              this.createElement("button", { id: "saveWorkflowButton", class: "primaryButton", type: "submit", textContent: "Save workflow" }),
            ] }),
          ] }),
        ],
      })],
    });

    this.appendChildren(this, [dialog]);
    this.querySelector("#closeWorkflowButton").addEventListener("click", () => dialog.close());
    this.querySelector("#cancelWorkflowButton").addEventListener("click", () => dialog.close());
    this.querySelector("#workflowForm").addEventListener("submit", (event) => {
      event.preventDefault();
      this.emit("save-workflow");
    });
    for (const input of this.querySelectorAll("[data-workflow-effect]")) {
      input.addEventListener("change", () => {
        this.syncDiagram();
        this.emit("workflow-draft-change");
      });
    }
    this.querySelector("#workflowInputSource").addEventListener("change", () => this.emit("workflow-draft-change"));
    for (const group of this.querySelectorAll("[data-workflow-step]")) {
      const toggle = () => this.querySelector(`[data-workflow-effect="${group.dataset.workflowStep}"]`).click();
      group.addEventListener("click", toggle);
      group.addEventListener("keydown", (event) => {
        if (!['Enter', ' '].includes(event.key)) return;
        event.preventDefault();
        toggle();
      });
    }
  }

  syncDiagram() {
    const enabled = new Map([...this.querySelectorAll("[data-workflow-effect]")]
      .map((input) => [input.dataset.workflowEffect, input.checked]));
    for (const group of this.querySelectorAll("[data-workflow-step]")) {
      const active = enabled.get(group.dataset.workflowStep) === true;
      group.classList.toggle("enabled", active);
      group.classList.toggle("disabled", !active);
      group.setAttribute("aria-checked", String(active));
      group.querySelector(".workflowStepStateText").textContent = active ? "Enabled" : "Skipped";
    }
    for (const connector of this.querySelectorAll(".workflowConnector")) {
      const active = enabled.get(connector.dataset.workflowFrom) && enabled.get(connector.dataset.workflowTo);
      connector.classList.toggle("enabled", active);
    }
    const count = [...enabled.values()].filter(Boolean).length;
    this.querySelector("#workflowEnabledCount").textContent = `${count} of ${enabled.size} enabled`;
  }
}

customElements.define("workflow-modal", WorkflowModal);

export default WorkflowModal;
