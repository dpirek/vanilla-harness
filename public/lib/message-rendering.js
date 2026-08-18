import { codeLanguageLabel, highlightCode, normalizeCodeLanguage } from "./file-utils.js";

function createCodeBlock(source, languageName = "") {
  const language = normalizeCodeLanguage(languageName);
  const block = document.createElement("div");
  block.className = "codeBlock";
  const label = document.createElement("div");
  label.className = "codeLanguage";
  label.textContent = codeLanguageLabel(language);
  const pre = document.createElement("pre");
  const code = document.createElement("code");
  code.className = language ? `language-${language}` : "";
  code.append(highlightCode(source, language));
  pre.append(code);
  block.append(label, pre);
  return block;
}

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
    container.append(createCodeBlock(match[2].replace(/\r?\n$/, ""), match[1]));
    cursor = match.index + match[0].length;
  }
  if (cursor < value.length) {
    const paragraph = document.createElement("p");
    paragraph.textContent = value.slice(cursor).replace(/^\n+/, "");
    if (paragraph.textContent) container.append(paragraph);
  }
}

function splitTableRow(line) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "")
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim().replace(/\\\|/g, "|"));
}

function tableAlignment(cell) {
  const value = cell.trim();
  if (value.startsWith(":") && value.endsWith(":")) return "center";
  if (value.endsWith(":")) return "right";
  return "left";
}

function isTableDivider(line = "") {
  const cells = splitTableRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function markdownBlocks(markdown) {
  const lines = String(markdown || "").replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  const startsBlock = (index) => {
    const line = lines[index] || "";
    return /^\s*(```|~~~)/.test(line) || /^\s{0,3}#{1,6}\s+/.test(line) ||
      /^\s*>/.test(line) || /^\s*(?:[-+*]|\d+[.)])\s+/.test(line) ||
      /^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line) ||
      (line.includes("|") && isTableDivider(lines[index + 1]));
  };

  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fence = line.match(/^\s*(```|~~~)\s*([\w+-]*)\s*$/);
    if (fence) {
      const source = [];
      index += 1;
      while (index < lines.length && !new RegExp(`^\\s*${fence[1]}\\s*$`).test(lines[index])) {
        source.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push({ type: "code", language: fence[2], text: source.join("\n") });
      continue;
    }

    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2] });
      index += 1;
      continue;
    }

    if (/^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push({ type: "rule" });
      index += 1;
      continue;
    }

    if (line.includes("|") && isTableDivider(lines[index + 1])) {
      const headers = splitTableRow(line);
      const alignments = splitTableRow(lines[index + 1]).map(tableAlignment);
      const rows = [];
      index += 2;
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
        rows.push(splitTableRow(lines[index]));
        index += 1;
      }
      blocks.push({ type: "table", headers, alignments, rows });
      continue;
    }

    if (/^\s*>/.test(line)) {
      const quote = [];
      while (index < lines.length && /^\s*>/.test(lines[index])) {
        quote.push(lines[index].replace(/^\s*>\s?/, ""));
        index += 1;
      }
      blocks.push({ type: "quote", text: quote.join("\n") });
      continue;
    }

    const listMatch = line.match(/^\s*(?:([-+*])|(\d+)[.)])\s+(.+)$/);
    if (listMatch) {
      const ordered = Boolean(listMatch[2]);
      const items = [];
      const start = ordered ? Number(listMatch[2]) : undefined;
      while (index < lines.length) {
        const item = lines[index].match(/^\s*(?:([-+*])|(\d+)[.)])\s+(.+)$/);
        if (!item || Boolean(item[2]) !== ordered) break;
        items.push(item[3]);
        index += 1;
      }
      blocks.push({ type: "list", ordered, start, items });
      continue;
    }

    const paragraph = [line];
    index += 1;
    while (index < lines.length && lines[index].trim() && !startsBlock(index)) {
      paragraph.push(lines[index]);
      index += 1;
    }
    blocks.push({ type: "paragraph", text: paragraph.join("\n") });
  }
  return blocks;
}

function safeLinkHref(value = "") {
  const href = String(value).trim();
  if (!href) return "";
  if (/^(?:https?:|mailto:)/i.test(href)) return href;
  if (/^[a-z][a-z\d+.-]*:/i.test(href) || href.startsWith("//") || href.startsWith("\\")) return "";
  return href;
}

function nextInlineToken(value, cursor) {
  const patterns = [
    ["escape", /\\([\\`*_[\]{}()#+.!~>-])/g],
    ["code", /`([^`\n]+)`/g],
    ["link", /\[([^\]\n]+)\]\(([^\s)]+)(?:\s+"([^"]*)")?\)/g],
    ["strong", /\*\*([^*\n]+)\*\*|__([^_\n]+)__/g],
    ["strike", /~~([^~\n]+)~~/g],
    ["emphasis", /\*([^*\n]+)\*|_([^_\n]+)_/g],
    ["break", /\u0000/g],
  ];
  let next = null;
  for (const [type, pattern] of patterns) {
    pattern.lastIndex = cursor;
    const match = pattern.exec(value);
    if (match && (!next || match.index < next.match.index)) next = { type, match };
  }
  return next;
}

function appendInlineMarkdown(container, text, options = {}) {
  const value = String(text).replace(/ {2,}\n/g, "\u0000").replace(/\n/g, " ");
  let cursor = 0;
  while (cursor < value.length) {
    const token = nextInlineToken(value, cursor);
    if (!token) {
      container.append(document.createTextNode(value.slice(cursor)));
      break;
    }
    if (token.match.index > cursor) {
      container.append(document.createTextNode(value.slice(cursor, token.match.index)));
    }
    const { type, match } = token;
    if (type === "escape") {
      container.append(document.createTextNode(match[1]));
    } else if (type === "code") {
      const code = document.createElement("code");
      code.className = "inlineCode";
      code.textContent = match[1];
      container.append(code);
    } else if (type === "link") {
      const sourceHref = safeLinkHref(match[2]);
      const resolution = sourceHref && options.resolveLink
        ? options.resolveLink(sourceHref)
        : { href: sourceHref, previewImage: false };
      const href = safeLinkHref(typeof resolution === "string" ? resolution : resolution?.href);
      if (!sourceHref || !href) {
        container.append(document.createTextNode(match[0]));
      } else {
        const link = document.createElement("a");
        link.href = href;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        if (match[3]) link.title = match[3];
        if (resolution?.previewImage) {
          link.className = "workspaceImageLink";
          const image = document.createElement("img");
          image.src = href;
          image.alt = match[1].replace(/[`*_~]/g, "").trim() || "Workspace image";
          image.loading = "lazy";
          const caption = document.createElement("span");
          caption.className = "workspaceImageCaption";
          appendInlineMarkdown(caption, match[1], options);
          link.append(image, caption);
        } else {
          appendInlineMarkdown(link, match[1], options);
        }
        container.append(link);
      }
    } else if (["strong", "strike", "emphasis"].includes(type)) {
      const element = document.createElement(type === "strong" ? "strong" : type === "strike" ? "del" : "em");
      appendInlineMarkdown(element, match[1] || match[2], options);
      container.append(element);
    } else {
      container.append(document.createElement("br"));
    }
    cursor = match.index + match[0].length;
  }
}

function appendMarkdown(container, markdown, options = {}) {
  for (const block of markdownBlocks(markdown)) {
    if (block.type === "code") {
      container.append(createCodeBlock(block.text, block.language));
      continue;
    }
    if (block.type === "rule") {
      container.append(document.createElement("hr"));
      continue;
    }
    if (block.type === "quote") {
      const quote = document.createElement("blockquote");
      appendMarkdown(quote, block.text, options);
      container.append(quote);
      continue;
    }
    if (block.type === "list") {
      const list = document.createElement(block.ordered ? "ol" : "ul");
      if (block.ordered && block.start !== 1) list.start = block.start;
      for (const text of block.items) {
        const item = document.createElement("li");
        appendInlineMarkdown(item, text, options);
        list.append(item);
      }
      container.append(list);
      continue;
    }
    if (block.type === "table") {
      const wrapper = document.createElement("div");
      wrapper.className = "markdownTable";
      const table = document.createElement("table");
      const head = document.createElement("thead");
      const headRow = document.createElement("tr");
      block.headers.forEach((text, index) => {
        const cell = document.createElement("th");
        cell.style.textAlign = block.alignments[index] || "left";
        appendInlineMarkdown(cell, text, options);
        headRow.append(cell);
      });
      head.append(headRow);
      const body = document.createElement("tbody");
      for (const row of block.rows) {
        const tableRow = document.createElement("tr");
        block.headers.forEach((_, index) => {
          const cell = document.createElement("td");
          cell.style.textAlign = block.alignments[index] || "left";
          appendInlineMarkdown(cell, row[index] || "", options);
          tableRow.append(cell);
        });
        body.append(tableRow);
      }
      table.append(head, body);
      wrapper.append(table);
      container.append(wrapper);
      continue;
    }
    const element = document.createElement(block.type === "heading" ? `h${block.level}` : "p");
    appendInlineMarkdown(element, block.text, options);
    container.append(element);
  }
}

export { appendMarkdown, appendMessageText, markdownBlocks, safeLinkHref };
