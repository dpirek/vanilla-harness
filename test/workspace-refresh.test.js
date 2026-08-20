import assert from "node:assert/strict";
import test from "node:test";

import { shouldRefreshWorkspaceForAgentEvent } from "../public/lib/workspace-refresh.js";

test("completed file-writing tools refresh the workspace files column", () => {
  assert.equal(shouldRefreshWorkspaceForAgentEvent({ type: "tool_result", name: "write_file" }), true);
  assert.equal(shouldRefreshWorkspaceForAgentEvent({ type: "tool_result", name: "run_command" }), true);
});

test("read-only and incomplete tool events do not refresh the files column", () => {
  assert.equal(shouldRefreshWorkspaceForAgentEvent({ type: "tool_start", name: "write_file" }), false);
  assert.equal(shouldRefreshWorkspaceForAgentEvent({ type: "tool_result", name: "read_file" }), false);
  assert.equal(shouldRefreshWorkspaceForAgentEvent({ type: "turn" }), false);
});
