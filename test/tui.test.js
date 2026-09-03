import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { formatPromptLine, formatTable, parseCommandLine, stripAnsi, wrapText } from "../lib/tui.js";
import { boolValue, parseOptions, selectBy } from "../cli.js";
import { createUiStateStore } from "../lib/ui-state.js";

test("terminal command parser supports quoted and escaped arguments", () => {
  assert.deepEqual(parseCommandLine('/provider custom "my model" http://localhost key\\ value'), [
    "/provider", "custom", "my model", "http://localhost", "key value",
  ]);
  assert.throws(() => parseCommandLine('/rename "unfinished'), /Unclosed quote/);
});

test("terminal tables align visible text without counting ANSI sequences", () => {
  const output = formatTable([["\x1b[31mone\x1b[0m", "1"], ["longer", "22"]], { headers: ["Name", "Count"] });
  assert.match(stripAnsi(output), /one     1/);
  assert.match(stripAnsi(output), /longer  22/);
});

test("terminal text wraps long content", () => {
  assert.equal(wrapText("alpha beta gamma", 10), "alpha beta\ngamma");
});

test("terminal prompt uses a chevron, full-width fill, and vertical padding", () => {
  const empty = formatPromptLine("", { placeholder: "Ask anything", columns: 24, color: false });
  assert.equal(empty, `${" ".repeat(24)}\n  › Ask anything        \n${" ".repeat(24)}`);

  const typed = formatPromptLine("hello", { columns: 24 });
  assert.equal(stripAnsi(typed), `\r${" ".repeat(24)}\n\r  › hello               \n\r${" ".repeat(24)}`);
  assert.match(typed, /\x1b\[48;2;30;30;30m/);
  assert.doesNotMatch(stripAnsi(typed), /Ask AI Harness/);
});

test("CLI options, booleans, and indexed selections normalize input", () => {
  assert.deepEqual(parseOptions(["--workspace", "demo", "-p", "hello"]), {
    prompt: "hello", workspace: "demo", dataDir: "", help: false,
  });
  assert.equal(boolValue("yes"), true);
  assert.equal(boolValue("off"), false);
  assert.throws(() => boolValue("maybe"), /Expected on or off/);
  assert.equal(selectBy([{ id: "a", name: "Alpha" }], "1").id, "a");
  assert.equal(selectBy([{ id: "a", name: "Alpha" }], "alpha").id, "a");
});

test("CLI commands update shared preset tool and workflow state", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "vanilla-harness-tui-test-"));
  const store = createUiStateStore(path.join(directory, "state.sqlite"));
  const ui = {
    line() {}, success() {}, error() {}, info() {}, table() {},
    style(value) { return value; },
    async confirm() { return true; },
  };
  const { HarnessCli } = await import("../cli.js");
  try {
    const cli = new HarnessCli({ store, ui, workspace: directory });
    await cli.command("/tool curl off");
    await cli.command("/effect composer off");
    await cli.command('/preset-new "Terminal preset"');

    const state = store.getRigConfigurations();
    const active = state.configurations.find((item) => item.id === state.activeConfigurationId);
    assert.equal(active.name, "Terminal preset");
    assert.equal(active.toolPermissions.curl, false);
    assert.equal(active.componentState.effects.composer, false);
  } finally {
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
