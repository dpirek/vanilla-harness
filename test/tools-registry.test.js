import assert from "node:assert/strict";
import test from "node:test";

import { createTools } from "../lib/tools/index.js";

test("local tool modules compose into the existing tool registry", () => {
  const tools = createTools({ root: process.cwd() });

  assert.deepEqual(tools.map((tool) => tool.name), [
    "list_files",
    "read_file",
    "write_file",
    "search_files",
    "curl",
    "run_command",
  ]);
  assert.equal(tools.find((tool) => tool.name === "read_file").validatesWorkspace, true);
  assert.equal(tools.find((tool) => tool.name === "write_file").mutatesWorkspace, true);
  assert.equal(tools.find((tool) => tool.name === "run_command").validatesWorkspace, true);
  assert.ok(tools.every((tool) => typeof tool.execute === "function"));
});
