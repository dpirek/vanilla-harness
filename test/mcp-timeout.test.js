import assert from "node:assert/strict";
import test from "node:test";

import { mcpStartupTimeoutMs } from "../lib/mcp.js";

test("stdio MCP initialization allows up to 60 seconds by default", () => {
  assert.equal(mcpStartupTimeoutMs(), 60_000);
  assert.equal(mcpStartupTimeoutMs({ startup_timeout_sec: 90 }), 90_000);
});

test("invalid MCP startup timeout overrides fall back to the default", () => {
  assert.equal(mcpStartupTimeoutMs({ startup_timeout_sec: 0 }), 60_000);
  assert.equal(mcpStartupTimeoutMs({ startup_timeout_sec: "invalid" }), 60_000);
});
