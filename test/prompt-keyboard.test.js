import assert from "node:assert/strict";
import test from "node:test";

import { shouldSubmitPrompt } from "../public/lib/prompt-keyboard.js";

test("Enter submits prompts even when the input already contains multiple lines", () => {
  const inputValue = "First line\nSecond line\nThird line";
  assert.ok(inputValue.includes("\n"));
  assert.equal(shouldSubmitPrompt({ key: "Enter", shiftKey: false }), true);
});

test("Shift+Enter inserts a line and composing Enter does not submit", () => {
  assert.equal(shouldSubmitPrompt({ key: "Enter", shiftKey: true }), false);
  assert.equal(shouldSubmitPrompt({ key: "Enter", shiftKey: false, isComposing: true }), false);
  assert.equal(shouldSubmitPrompt({ key: "Enter", shiftKey: false, keyCode: 229 }), false);
});
