import assert from "node:assert/strict";
import test from "node:test";

import { shouldSubmitPrompt } from "../public/lib/prompt-keyboard.js";
import { commandMenuItems, filterCommandOptions, parsePromptCommand } from "../public/lib/prompt-commands.js";

test("Enter submits prompts even when the input already contains multiple lines", () => {
  const inputValue = "First line\nSecond line\nThird line";
  assert.ok(inputValue.includes("\n"));
  assert.equal(shouldSubmitPrompt({ key: "Enter", shiftKey: false }), true);
});

test("slash commands parse command names and option queries", () => {
  assert.equal(parsePromptCommand("hello"), null);
  assert.equal(parsePromptCommand("/mod").command, null);
  assert.equal(parsePromptCommand("/model").command.name, "model");
  assert.equal(parsePromptCommand("/model gpt-5").query, "gpt-5");
});

test("partial slash commands autocomplete and options filter", () => {
  assert.deepEqual(commandMenuItems("/mod").map((item) => item.label), ["/model"]);
  const options = [
    { label: "gpt-5", description: "OpenAI" },
    { label: "llama3", description: "Ollama" },
  ];
  assert.deepEqual(filterCommandOptions(options, "olla").map((item) => item.label), ["llama3"]);
});

test("Shift+Enter inserts a line and composing Enter does not submit", () => {
  assert.equal(shouldSubmitPrompt({ key: "Enter", shiftKey: true }), false);
  assert.equal(shouldSubmitPrompt({ key: "Enter", shiftKey: false, isComposing: true }), false);
  assert.equal(shouldSubmitPrompt({ key: "Enter", shiftKey: false, keyCode: 229 }), false);
});
