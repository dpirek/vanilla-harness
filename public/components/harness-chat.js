import BaseComponent from "./base-component.js";
import "./dropdown-button.js";
import { microphoneIcon, workspaceExplorerIcon } from "../lib/icons.js";
import { shouldSubmitPrompt } from "../lib/prompt-keyboard.js";
import { commandMenuItems, parsePromptCommand } from "../lib/prompt-commands.js";

class HarnessChat extends BaseComponent {
  connectedCallback() {
    if (this.childElementCount) return;
    this.render();
  }

  render() {
    this.setAttribute("role", "main");
    this.appendChildren(this, [
      this.createElement("header", {
        class: "chatTopbar",
        children: [
          this.createElement("div", {
            class: "columnVisibilityControls",
            "aria-label": "Chat controls",
            children: [
              this.createElement("div", {
                id: "presetStatusBar",
                class: "presetStatusBar",
                hidden: "",
                role: "group",
                "aria-live": "polite",
                "aria-label": "Active preset settings",
                children: [
                  this.createElement("div", {
                    id: "presetStatusItems",
                    class: "presetStatusItems",
                  }),
                  this.createElement("dropdown-button", {
                    id: "presetDropdown",
                    placeholder: "Presets",
                    "aria-label": "Select preset",
                  }),
                ],
              }),
              this.createElement("button", {
                id: "toggleFilesColumnButton",
                class: "columnToggleButton",
                hidden: "",
                type: "button",
                "aria-label": "Hide workspace column",
                "aria-pressed": "true",
                title: "Hide workspace column",
                children: [workspaceExplorerIcon()],
              }),
            ],
          }),
        ],
      }),
      this.createElement("section", { "id": "messages", "class": "messages", "aria-live": "polite", 
        children: [
          this.createElement("div", { "id": "emptyState", "class": "emptyState", 
            children: [document.createTextNode("Ask the harness to inspect, edit, or explain this workspace.")] })] }),
      this.createElement("footer", { "class": "composerWrap", children: [
        this.createElement("form", { "id": "promptForm", "class": "composer", children: [
          this.createElement("div", {
            id: "promptCommandMenu",
            class: "promptCommandMenu",
            role: "listbox",
            hidden: "",
            "aria-label": "Prompt commands",
          }),
          this.createElement("div", { "id": "imagePreviewList", "class": "imagePreviewList", "aria-live": "polite" }), 
        this.createElement("input", { "id": "imageInput", "type": "file", "accept": "image/*", "multiple": "", "hidden": "" }), 
        this.createElement("button", { "id": "addImageButton", "class": "composerIcon", "type": "button", "aria-label": "Add image", "title": "Add image", children: [document.createTextNode("＋")] }), 
      this.createElement("textarea", { 
        "id": "promptInput", 
        "name": "prompt", 
        "rows": "1", 
        "enterkeyhint": "send",
        "aria-controls": "promptCommandMenu",
        "aria-expanded": "false",
        "aria-autocomplete": "list",
        "placeholder": 
        "Ask AI Harness", 
        "required": "" 
      }), 
      this.createElement("button", {
        "id": "microphoneButton",
        "class": "composerIcon microphoneButton",
        "type": "button",
        "aria-label": "Start voice input",
        "aria-pressed": "false",
        "title": "Start voice input",
        children: [microphoneIcon()],
      }),
      this.createElement("button", { "id": "sendButton", "class": "sendButton", "type": "submit", "aria-label": "Send", children: [document.createTextNode("↑")] })] })] }),
      this.createElement("button", { "id": "resetButton", "class": "resetFab", "type": "button", children: [document.createTextNode("Reset")] })
    ]);
    const form = this.querySelector("#promptForm");
    const input = this.querySelector("#promptInput");
    const imageInput = this.querySelector("#imageInput");
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!this.querySelector("#promptCommandMenu").hidden) {
        this.chooseCommandItem();
        return;
      }
      this.emit("submit-prompt");
    });
    this.querySelector("#addImageButton").addEventListener("click", () => imageInput.click());
    this.querySelector("#microphoneButton").addEventListener("click", () => this.emit("toggle-microphone"));
    imageInput.addEventListener("change", () => {
      this.emit("images-selected", { files: Array.from(imageInput.files || []) });
      imageInput.value = "";
    });
    input.addEventListener("input", () => {
      this.resizeInput();
      this.emit("prompt-edited");
      this.updatePromptCommands();
    });
    input.addEventListener("keydown", (event) => {
      if (this.handleCommandKeydown(event)) return;
      if (shouldSubmitPrompt(event)) {
        event.preventDefault();
        this.emit("submit-prompt");
        return;
      }
      if (!event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && ["ArrowUp", "ArrowDown"].includes(event.key)) {
        event.preventDefault(); this.emit("navigate-prompt-history", { direction: event.key === "ArrowUp" ? -1 : 1 });
      }
    });
    this.querySelector("#toggleFilesColumnButton").addEventListener("click", () => this.emit("toggle-files-column"));
    this.querySelector("#resetButton").addEventListener("click", () => this.emit("reset-chat"));
  }

  updatePromptCommands() {
    const input = this.querySelector("#promptInput");
    const parsed = parsePromptCommand(input.value);
    if (!parsed) {
      this.closeCommandMenu();
      return;
    }
    if (!parsed.command) {
      this.setCommandMenu(commandMenuItems(input.value), { label: "Commands", emptyMessage: "No matching commands" });
      return;
    }
    this.emit("prompt-command-query", { command: parsed.command.name, query: parsed.query });
  }

  setCommandMenu(items = [], { label = "Options", emptyMessage = "No matching options" } = {}) {
    const menu = this.querySelector("#promptCommandMenu");
    this.commandItems = items;
    this.commandIndex = Math.min(this.commandIndex || 0, Math.max(0, items.length - 1));
    menu.replaceChildren();

    const heading = this.createElement("div", { class: "promptCommandHeading", textContent: label });
    menu.append(heading);
    if (!items.length) {
      menu.append(this.createElement("div", { class: "promptCommandEmpty", textContent: emptyMessage }));
    } else {
      items.forEach((item, index) => {
        const button = this.createElement("button", {
          type: "button",
          class: "promptCommandOption",
          role: "option",
          "aria-selected": index === this.commandIndex ? "true" : "false",
        });
        const copy = this.createElement("span", { class: "promptCommandCopy" });
        copy.append(
          this.createElement("strong", { textContent: item.label }),
          this.createElement("small", { textContent: item.description || "" }),
        );
        button.append(copy);
        if (item.selected !== undefined && (item.toggle || item.selected)) {
          button.append(this.createElement("span", {
            class: "promptCommandState",
            textContent: item.toggle ? (item.selected ? "On" : "Off") : "Current",
          }));
        }
        button.addEventListener("pointermove", () => this.selectCommandIndex(index));
        button.addEventListener("click", () => this.chooseCommandItem(index));
        menu.append(button);
      });
    }
    menu.hidden = false;
    this.querySelector("#promptInput").setAttribute("aria-expanded", "true");
  }

  selectCommandIndex(index) {
    if (!this.commandItems?.length) return;
    this.commandIndex = (index + this.commandItems.length) % this.commandItems.length;
    const options = [...this.querySelectorAll(".promptCommandOption")];
    options.forEach((option, optionIndex) => option.setAttribute("aria-selected", optionIndex === this.commandIndex ? "true" : "false"));
    options[this.commandIndex]?.scrollIntoView({ block: "nearest" });
  }

  chooseCommandItem(index = this.commandIndex || 0) {
    const item = this.commandItems?.[index];
    if (!item) return;
    if (item.complete) {
      const input = this.querySelector("#promptInput");
      input.value = `/${item.command} `;
      this.resizeInput();
      this.emit("prompt-edited");
      this.updatePromptCommands();
      return;
    }
    this.emit("prompt-command-select", { item });
  }

  handleCommandKeydown(event) {
    const menu = this.querySelector("#promptCommandMenu");
    if (menu.hidden) return false;
    if (event.key === "Escape") {
      event.preventDefault();
      this.closeCommandMenu();
      return true;
    }
    if (["ArrowUp", "ArrowDown"].includes(event.key)) {
      event.preventDefault();
      if (this.commandItems?.length) {
        this.selectCommandIndex((this.commandIndex || 0) + (event.key === "ArrowUp" ? -1 : 1));
      }
      return true;
    }
    if (event.key === "Tab" || shouldSubmitPrompt(event)) {
      event.preventDefault();
      if (this.commandItems?.length) this.chooseCommandItem();
      return true;
    }
    return false;
  }

  closeCommandMenu({ clearPrompt = false } = {}) {
    const menu = this.querySelector("#promptCommandMenu");
    menu.hidden = true;
    menu.replaceChildren();
    this.commandItems = [];
    this.commandIndex = 0;
    const input = this.querySelector("#promptInput");
    input.setAttribute("aria-expanded", "false");
    if (clearPrompt) {
      input.value = "";
      this.resizeInput();
      this.emit("prompt-edited");
    }
  }

  resizeInput() {
    const input = this.querySelector("#promptInput");
    input.style.height = "26px";
    input.style.height = `${Math.min(input.scrollHeight, 168)}px`;
    input.style.overflowY = input.scrollHeight > 168 ? "auto" : "hidden";
  }
}

customElements.define("harness-chat", HarnessChat);

export default HarnessChat;
