async function copyTextToClipboard(value, {
  clipboard = globalThis.navigator?.clipboard,
  documentRef = globalThis.document,
} = {}) {
  const text = String(value ?? "");
  if (clipboard?.writeText) {
    try {
      await clipboard.writeText(text);
      return;
    } catch {
      // Fall back for browsers that expose the API but deny it in this context.
    }
  }

  if (!documentRef?.body || typeof documentRef.execCommand !== "function") {
    throw new Error("Clipboard access is unavailable.");
  }
  const input = documentRef.createElement("textarea");
  input.value = text;
  input.setAttribute("readonly", "");
  input.style.position = "fixed";
  input.style.opacity = "0";
  documentRef.body.append(input);
  let copied = false;
  try {
    input.select();
    copied = documentRef.execCommand("copy");
  } finally {
    input.remove();
  }
  if (!copied) throw new Error("Unable to copy to the clipboard.");
}

export { copyTextToClipboard };
