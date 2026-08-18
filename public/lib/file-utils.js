const CODE_LANGUAGE_LABELS = {
  html: "HTML",
  css: "CSS",
  javascript: "JavaScript",
};

const FILE_LANGUAGE_MAP = {
  htm: "html",
  html: "html",
  css: "css",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
};

const IMAGE_FILE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "svg",
  "bmp",
  "ico",
  "avif",
]);

const HIGHLIGHT_PATTERNS = {
  html: /<!--[\s\S]*?-->|<!DOCTYPE[^>]*>|<\/?[^>]+>/gi,
  css: /\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|#[\da-f]{3,8}\b|@[\w-]+|--[\w-]+|[\w-]+(?=\s*:)|\b\d+(?:\.\d+)?(?:px|rem|em|vh|vw|%|s|ms)?\b|[{}()[\].,;:]|[>+~*=/!-]/gi,
  javascript: /\/\*[\s\S]*?\*\/|\/\/[^\n]*|`(?:\\.|[^`\\])*`|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b(?:const|let|var|function|return|if|else|for|while|class|new|import|export|from|async|await|try|catch|throw|true|false|null|undefined|this|typeof|switch|case|break|continue|extends|static)\b|\b\d+(?:\.\d+)?\b|=>|===?|!==?|<=?|>=?|&&|\|\||[{}()[\].,;:+*/%!-]/g,
};

function normalizeCodeLanguage(language = "") {
  const value = String(language || "").trim().toLowerCase();
  if (!value) return "";
  if (value === "js") return "javascript";
  if (value === "htm") return "html";
  return CODE_LANGUAGE_LABELS[value] ? value : value;
}

function detectCodeLanguageFromPath(filePath = "") {
  const extension = String(filePath || "").split(".").pop()?.toLowerCase();
  return FILE_LANGUAGE_MAP[extension] || "";
}

function isPreviewableImagePath(filePath = "") {
  const extension = String(filePath || "").split(".").pop()?.toLowerCase();
  return IMAGE_FILE_EXTENSIONS.has(extension);
}

function codeLanguageLabel(language = "") {
  const normalized = normalizeCodeLanguage(language);
  if (normalized === "plaintext" || normalized === "text") return "Plain text";
  return CODE_LANGUAGE_LABELS[normalized] || normalized || "Code";
}

function tokenClass(token, language) {
  if (/^\s+$/.test(token)) return "";
  if (/^\/\*[\s\S]*\*\/$|^\/\//.test(token) || /^<!--[\s\S]*-->$/.test(token)) return "syntax-comment";
  if (/^["'`]/.test(token)) return "syntax-string";
  if (/^\d/.test(token) || /^#[\da-f]{3,8}$/i.test(token)) return "syntax-number";
  if (language === "html" && /^</.test(token)) return "syntax-tag";
  if (language === "css" && /^(?:--)?[\w-]+$/.test(token)) return "syntax-property";
  if (/^(?:const|let|var|function|return|if|else|for|while|class|new|import|export|from|async|await|try|catch|throw|true|false|null|undefined|this|typeof|switch|case|break|continue|extends|static)$/.test(token)) return "syntax-keyword";
  if (/^[{}()[\].,;:]$|^(?:=>|===?|!==?|<=?|>=?|&&|\|\||[+*/%!-])$/.test(token)) return "syntax-operator";
  if (language === "css" && /^@/.test(token)) return "syntax-keyword";
  return "";
}

function highlightCode(code, language = "") {
  const fragment = document.createDocumentFragment();
  const normalized = normalizeCodeLanguage(language);
  const pattern = HIGHLIGHT_PATTERNS[normalized];
  const value = String(code ?? "");
  if (!pattern) {
    fragment.append(document.createTextNode(value));
    return fragment;
  }
  let cursor = 0;
  for (const match of value.matchAll(pattern)) {
    if (match.index > cursor) fragment.append(document.createTextNode(value.slice(cursor, match.index)));
    const span = document.createElement("span");
    span.className = tokenClass(match[0], normalized);
    span.textContent = match[0];
    fragment.append(span);
    cursor = match.index + match[0].length;
  }
  if (cursor < value.length) fragment.append(document.createTextNode(value.slice(cursor)));
  return fragment;
}

function renderFilePreview(codeElement, content, { filePath = "", language = "" } = {}) {
  const resolvedLanguage = normalizeCodeLanguage(language) || detectCodeLanguageFromPath(filePath);
  codeElement.className = resolvedLanguage ? `language-${resolvedLanguage}` : "";
  codeElement.replaceChildren(highlightCode(content, resolvedLanguage));
  return resolvedLanguage;
}

export {
  codeLanguageLabel,
  detectCodeLanguageFromPath,
  highlightCode,
  isPreviewableImagePath,
  normalizeCodeLanguage,
  renderFilePreview,
};
