import assert from "node:assert/strict";
import test from "node:test";

import { copyTextToClipboard } from "../public/lib/clipboard.js";

test("clipboard helper copies the exact source text", async () => {
  let copied = null;
  await copyTextToClipboard("# Raw **Markdown**", {
    clipboard: { async writeText(value) { copied = value; } },
  });
  assert.equal(copied, "# Raw **Markdown**");
});

test("clipboard helper falls back when modern clipboard access is denied", async () => {
  let selected = false;
  const input = {
    setAttribute() {},
    style: {},
    select() { selected = true; },
    remove() {},
  };
  const documentRef = {
    body: { append(node) { assert.equal(node, input); } },
    createElement(tag) { assert.equal(tag, "textarea"); return input; },
    execCommand(command) { assert.equal(command, "copy"); return true; },
  };
  await copyTextToClipboard("source", {
    clipboard: { async writeText() { throw new Error("denied"); } },
    documentRef,
  });
  assert.equal(input.value, "source");
  assert.equal(selected, true);
});
