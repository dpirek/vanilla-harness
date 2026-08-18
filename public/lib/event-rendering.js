import { appendMessageText } from "./message-rendering.js";

function formatJson(value) {
  return JSON.stringify(value, null, 2);
}

function describeAgentEvent(event) {
  if (event.type === "composer_start") return `Input Composer refining with ${event.model}`;
  if (event.type === "composer_complete") return `Input Composer refined prompt: ${event.refinedPrompt}`;
  if (event.type === "start") return "Run started";
  if (event.type === "turn_start") return `Model turn ${event.turn} started`;
  if (event.type === "turn") return `Model turn ${event.turn}`;
  if (event.type === "response") return `Response ${event.id}`;
  if (event.type === "tool_start") return `Tool started: ${event.name}`;
  if (event.type === "tool_result") {
    return `Tool ${event.output?.ok === false ? "failed" : "completed"}: ${event.name}`;
  }
  if (event.type === "validation") {
    if (event.status === "passed") return `Validation passed: ${event.tool}`;
    if (event.status === "failed") return `Validation failed: ${event.tool}`;
    if (event.status === "pending") return "Validation pending";
    return "Validation required";
  }
  if (event.type === "mcp_call") return `MCP call: ${event.server}.${event.name}`;
  if (event.type === "approval_request") return `Approval requested: ${event.server}.${event.name}`;
  if (event.type === "approval_response") {
    return `Approval ${event.approved ? "granted" : "denied"}: ${event.server}.${event.name}`;
  }
  if (event.type === "final") return "Final answer received";
  return event.type;
}

function eventIcon(title) {
  const value = title.toLowerCase();
  if (value.includes("validation")) return "♢";
  if (value.includes("error") || value.includes("failed") || value.includes("denied")) return "!";
  if (value.includes("tool") || value.includes("command")) return "⌘";
  if (value.includes("approval")) return "✓";
  if (value.includes("response") || value.includes("answer")) return "↳";
  if (value.includes("prompt") || value.includes("message")) return "→";
  if (value.includes("model") || value.includes("provider")) return "◇";
  if (value.includes("socket") || value.includes("connected")) return "●";
  if (value.includes("config") || value.includes("workspace")) return "⚙";
  return "·";
}

let promptDetailModal = null;
let promptDetailModalTitle = null;
let promptDetailModalContent = null;

function ensurePromptDetailModal() {
  if (promptDetailModal) return promptDetailModal;
  promptDetailModalTitle = document.createElement("h2");
  promptDetailModalTitle.id = "eventPromptDetailTitle";
  promptDetailModalTitle.textContent = "Prompt details";

  const closeButton = document.createElement("button");
  closeButton.className = "eventPromptModalClose";
  closeButton.type = "button";
  closeButton.textContent = "×";
  closeButton.setAttribute("aria-label", "Close prompt details");

  promptDetailModalContent = document.createElement("div");
  promptDetailModalContent.className = "eventPromptModalContent";

  const panel = document.createElement("section");
  panel.className = "eventPromptModalPanel";
  panel.append(
    Object.assign(document.createElement("header"), { className: "eventPromptModalHeader" }),
    promptDetailModalContent,
  );
  panel.firstChild.append(promptDetailModalTitle, closeButton);

  promptDetailModal = document.createElement("dialog");
  promptDetailModal.className = "eventPromptModal";
  promptDetailModal.setAttribute("aria-labelledby", "eventPromptDetailTitle");
  promptDetailModal.append(panel);
  document.body.append(promptDetailModal);

  closeButton.addEventListener("click", () => promptDetailModal.close());
  promptDetailModal.addEventListener("click", (event) => {
    if (event.target === promptDetailModal) promptDetailModal.close();
  });
  return promptDetailModal;
}

function extractTextInputs(input = []) {
  const entries = [];
  for (const item of Array.isArray(input) ? input : []) {
    const role = item?.role === "assistant" ? "Assistant" : item?.role === "system" ? "System" : "User";
    const texts = (Array.isArray(item?.content) ? item.content : [])
      .filter((content) => content?.type === "input_text" && typeof content.text === "string" && content.text.trim())
      .map((content) => content.text.trim());
    if (texts.length) entries.push({ label: `${role} input`, value: texts.join("\n\n") });
  }
  return entries;
}

function buildPromptDetailSections(detail = {}) {
  const sections = [];
  if (typeof detail.prompt === "string" && detail.prompt.trim()) {
    sections.push({ title: "Prompt", value: detail.prompt.trim() });
  }
  if (typeof detail.originalPrompt === "string" && detail.originalPrompt.trim()) {
    sections.push({ title: "Original prompt", value: detail.originalPrompt.trim() });
  }
  if (typeof detail.refinedPrompt === "string" && detail.refinedPrompt.trim()) {
    sections.push({ title: "Refined prompt", value: detail.refinedPrompt.trim() });
  }
  if (detail.inputPrompt && typeof detail.inputPrompt === "object") {
    if (typeof detail.inputPrompt.instructions === "string" && detail.inputPrompt.instructions.trim()) {
      sections.push({ title: "Instructions", value: detail.inputPrompt.instructions.trim() });
    }
    sections.push(...extractTextInputs(detail.inputPrompt.input));
    sections.push({
      title: "Request JSON",
      value: `\`\`\`json\n${formatJson(detail.inputPrompt)}\n\`\`\``,
    });
  }
  return sections;
}

function showPromptDetails(title, detail) {
  const sections = buildPromptDetailSections(detail);
  if (!sections.length) return;
  const modal = ensurePromptDetailModal();
  promptDetailModalTitle.textContent = title;
  promptDetailModalContent.replaceChildren(...sections.map((section) => {
    const article = document.createElement("article");
    article.className = "eventPromptModalSection";
    const heading = document.createElement("h3");
    heading.textContent = section.title;
    const body = document.createElement("div");
    body.className = "eventPromptModalBody";
    appendMessageText(body, section.value);
    article.append(heading, body);
    return article;
  }));
  if (!modal.open) modal.showModal();
}

function appendEvent(element, { title, detail, timestamp, className = "", open = false }) {
  const item = document.createElement("li");
  if (className) item.className = className;
  const disclosure = document.createElement("details");
  disclosure.open = open;
  const summary = document.createElement("summary");
  const icon = document.createElement("span");
  icon.className = "eventIcon";
  icon.textContent = eventIcon(title);
  icon.setAttribute("aria-hidden", "true");

  const heading = document.createElement("span");
  heading.className = "eventTitle";
  heading.textContent = title;

  const stamp = document.createElement("time");
  const eventDate = new Date(timestamp || Date.now());
  stamp.dateTime = eventDate.toISOString();
  stamp.textContent = eventDate.toLocaleTimeString([], {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });

  const chevron = document.createElement("span");
  chevron.className = "eventChevron";
  chevron.textContent = "›";
  chevron.setAttribute("aria-hidden", "true");
  summary.append(icon, heading, stamp, chevron);

  const pre = document.createElement("pre");
  pre.textContent = formatJson({ type: title, ...(detail !== undefined ? { detail } : {}) });
  disclosure.append(summary, pre);

  if (buildPromptDetailSections(detail).length) {
    const actions = document.createElement("div");
    actions.className = "eventActions";
    const detailsButton = document.createElement("button");
    detailsButton.type = "button";
    detailsButton.className = "eventDetailButton";
    detailsButton.textContent = "Show prompt details";
    detailsButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      showPromptDetails(title, detail);
    });
    actions.append(detailsButton);
    disclosure.append(actions);
  }

  item.append(disclosure);
  element.append(item);
  element.scrollTop = element.scrollHeight;
  return item;
}

function renderEventList(element, events) {
  element.replaceChildren();
  for (const event of events) appendEvent(element, event);
}

export { appendEvent, describeAgentEvent, renderEventList };
