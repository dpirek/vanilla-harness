import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { browserUrl, createChromeDevToolsTool } from "../lib/tools/chrome-devtools.js";
import { createWorkspaceContext } from "../lib/tools/workspace-context.js";

function fakeMcpLoader(calls) {
  return async () => [
    ["navigate_page", { content: [{ type: "text", text: "navigated" }] }],
    ["take_screenshot", { content: [{ type: "image", data: Buffer.from("image").toString("base64"), mimeType: "image/png" }] }],
    ["evaluate_script", { content: [{ type: "text", text: "evaluated" }] }],
    ["take_snapshot", { content: [{ type: "text", text: "snapshot" }] }],
    ["list_pages", { content: [{ type: "text", text: "pages" }] }],
  ].map(([name, response]) => ({
    name: `chrome_devtools_browser__${name}`,
    async execute(args) {
      calls.push({ name, args });
      return response;
    },
  }));
}

function argumentsFor(action, overrides = {}) {
  return {
    action,
    browser_command: null,
    command_arguments: null,
    url: null,
    javascript: null,
    path: null,
    full_page: null,
    format: null,
    timeout_ms: null,
    ...overrides,
  };
}

test("Chrome DevTools tool navigates and evaluates through the MCP server", async () => {
  const calls = [];
  const context = createWorkspaceContext({ root: process.cwd(), approve: async () => true });
  const tool = createChromeDevToolsTool(context, { loadMcpToolsImpl: fakeMcpLoader(calls) });

  const navigated = await tool.execute(argumentsFor("navigate", { url: "https://example.com" }));
  const evaluated = await tool.execute(argumentsFor("run_javascript", {
    javascript: "() => document.title",
  }));

  assert.equal(navigated.ok, true);
  assert.equal(evaluated.output, "evaluated");
  assert.equal(calls[0].name, "navigate_page");
  assert.equal(calls[0].args.url, "https://example.com/");
  assert.deepEqual(calls[1], {
    name: "evaluate_script",
    args: { function: "() => document.title" },
  });
});

test("Chrome DevTools tool executes only allowlisted browser commands", async () => {
  const calls = [];
  const context = createWorkspaceContext({ root: process.cwd(), approve: async () => true });
  const tool = createChromeDevToolsTool(context, { loadMcpToolsImpl: fakeMcpLoader(calls) });

  const result = await tool.execute(argumentsFor("browser_command", {
    browser_command: "list_pages",
    command_arguments: {},
  }));

  assert.equal(result.ok, true);
  assert.equal(result.output, "pages");
  assert.deepEqual(calls[0], { name: "list_pages", args: {} });
  await assert.rejects(
    tool.execute(argumentsFor("browser_command", {
      browser_command: "run_command",
      command_arguments: { command: "ls" },
    })),
    /Unsupported browser command/,
  );
});

test("Chrome DevTools browser commands reject unsafe URLs and output paths", async () => {
  const calls = [];
  const context = createWorkspaceContext({ root: process.cwd(), approve: async () => true });
  const tool = createChromeDevToolsTool(context, { loadMcpToolsImpl: fakeMcpLoader(calls) });

  await assert.rejects(
    tool.execute(argumentsFor("browser_command", {
      browser_command: "new_page",
      command_arguments: { url: "file:///etc/passwd" },
    })),
    /only allows http/,
  );
  await assert.rejects(
    tool.execute(argumentsFor("browser_command", {
      browser_command: "take_snapshot",
      command_arguments: { filePath: "../snapshot.txt" },
    })),
    /cannot write filePath/,
  );
  assert.deepEqual(calls, []);
});

test("Chrome DevTools screenshots are saved inside the workspace", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "chrome-devtools-tool-"));
  try {
    const calls = [];
    const context = createWorkspaceContext({ root: directory, approve: async () => true });
    const tool = createChromeDevToolsTool(context, {
      loadMcpToolsImpl: fakeMcpLoader(calls),
      now: () => 123,
    });

    const result = await tool.execute(argumentsFor("screenshot", { full_page: true }));

    assert.deepEqual(result, {
      ok: true,
      action: "screenshot",
      path: "screenshots/chrome-123.png",
      bytes: 5,
      format: "png",
      response: "",
    });
    assert.equal(await fs.readFile(path.join(directory, result.path), "utf8"), "image");
    assert.deepEqual(calls[0], {
      name: "take_screenshot",
      args: { format: "png", fullPage: true },
    });
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("Chrome DevTools navigation rejects non-web URLs", () => {
  assert.throws(() => browserUrl("file:///etc/passwd"), /only allows http/);
  assert.throws(() => browserUrl("javascript:alert(1)"), /only allows http/);
});
