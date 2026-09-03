import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { loadMcpTools, mcpSpawnEnv } from "../lib/mcp.js";

test("MCP subprocess PATH includes standard executable locations", () => {
  const env = mcpSpawnEnv({ PATH: "/custom/bin" });
  const entries = env.PATH.split(path.delimiter);

  assert.equal(entries[0], "/custom/bin");
  if (process.platform !== "win32") {
    assert.ok(entries.includes("/usr/bin"));
    assert.ok(entries.includes("/usr/local/bin"));
  }
});

test("missing MCP commands reject without an unhandled child-process error", async () => {
  const missingCommand = "vanilla-harness-command-that-does-not-exist";
  const configContent = `[mcp_servers.missing]\ncommand = "${missingCommand}"\nargs = []\nmessage_format = "json-lines"\n`;

  await assert.rejects(
    loadMcpTools({ configContent, env: { PATH: "" } }),
    new RegExp(`Could not start MCP server.*${missingCommand}.*not found`),
  );
});
