import BaseComponent from "./base-component.js";
import "./dropdown-button.js";
import { microphoneIcon, workspaceExplorerIcon } from "../lib/icons.js";
import { shouldSubmitPrompt } from "../lib/prompt-keyboard.js";

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
          this.createElement("div", { "id": "imagePreviewList", "class": "imagePreviewList", "aria-live": "polite" }), 
        this.createElement("input", { "id": "imageInput", "type": "file", "accept": "image/*", "multiple": "", "hidden": "" }), 
        this.createElement("button", { "id": "addImageButton", "class": "composerIcon", "type": "button", "aria-label": "Add image", "title": "Add image", children: [document.createTextNode("＋")] }), 
      this.createElement("textarea", { 
        "id": "promptInput", 
        "name": "prompt", 
        "rows": "1", 
        "enterkeyhint": "send",
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
    form.addEventListener("submit", (event) => { event.preventDefault(); this.emit("submit-prompt"); });
    this.querySelector("#addImageButton").addEventListener("click", () => imageInput.click());
    this.querySelector("#microphoneButton").addEventListener("click", () => this.emit("toggle-microphone"));
    imageInput.addEventListener("change", () => {
      this.emit("images-selected", { files: Array.from(imageInput.files || []) });
      imageInput.value = "";
    });
    input.addEventListener("input", () => { this.resizeInput(); this.emit("prompt-edited"); });
    input.addEventListener("keydown", (event) => {
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

  resizeInput() {
    const input = this.querySelector("#promptInput");
    input.style.height = "26px";
    input.style.height = `${Math.min(input.scrollHeight, 168)}px`;
    input.style.overflowY = input.scrollHeight > 168 ? "auto" : "hidden";
  }
}

customElements.define("harness-chat", HarnessChat);

export default HarnessChat;
