import { codeLanguageLabel, highlightCode, normalizeCodeLanguage } from "./file-utils.js";

function appendMessageText(container, text) {
  const value = String(text);
  const fencePattern = /^```([\w+-]*)[ \t]*\r?\n([\s\S]*?)^```[ \t]*$/gm;
  let cursor = 0;
  for (const match of value.matchAll(fencePattern)) {
    if (match.index > cursor) {
      const paragraph = document.createElement("p");
      paragraph.textContent = value.slice(cursor, match.index).replace(/\n+$/, "");
      if (paragraph.textContent) container.append(paragraph);
    }
    const language = normalizeCodeLanguage(match[1]);
    const block = document.createElement("div");
    block.className = "codeBlock";
    const label = document.createElement("div");
    label.className = "codeLanguage";
    label.textContent = codeLanguageLabel(language);
    const pre = document.createElement("pre");
    const code = document.createElement("code");
    code.className = language ? `language-${language}` : "";
    code.append(highlightCode(match[2].replace(/\r?\n$/, ""), language));
    pre.append(code);
    block.append(label, pre);
    container.append(block);
    cursor = match.index + match[0].length;
  }
  if (cursor < value.length) {
    const paragraph = document.createElement("p");
    paragraph.textContent = value.slice(cursor).replace(/^\n+/, "");
    if (paragraph.textContent) container.append(paragraph);
  }
}

export { appendMessageText };
