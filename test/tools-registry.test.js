import assert from "node:assert/strict";
import test from "node:test";

import { createToolRegistry, createTools } from "../lib/tools/index.js";

test("local tool modules compose into the existing tool registry", () => {
  const tools = createTools({ root: process.cwd() });

  assert.deepEqual(tools.map((tool) => tool.name), [
    "list_files",
    "read_file",
    "write_file",
    "search_files",
    "curl",
    "run_command",
    "chrome_devtools",
  ]);
  assert.equal(tools.find((tool) => tool.name === "read_file").validatesWorkspace, true);
  assert.equal(tools.find((tool) => tool.name === "write_file").mutatesWorkspace, true);
  assert.equal(tools.find((tool) => tool.name === "run_command").validatesWorkspace, true);
  assert.ok(tools.every((tool) => typeof tool.execute === "function"));
});

test("local tool registries can add and remove tools dynamically", async () => {
  const registry = createToolRegistry();
  registry.register("workspace_name", ({ workspace }) => ({
    name: "workspace_name",
    description: "Return the configured workspace.",
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
    async execute() {
      return { ok: true, workspace };
    },
  }));

  const [tool] = registry.createTools({ root: process.cwd() });
  assert.deepEqual(registry.list(), ["workspace_name"]);
  assert.equal((await tool.execute({})).workspace, process.cwd());
  assert.equal(registry.unregister("workspace_name"), true);
  assert.deepEqual(registry.createTools({ root: process.cwd() }), []);
});

test("local tool registries reject duplicate and malformed tools", () => {
  const factory = () => ({
    name: "example",
    parameters: { type: "object" },
    execute() {},
  });
  const registry = createToolRegistry([["example", factory]]);

  assert.throws(() => registry.register("example", factory), /already registered/);
  registry.register("replacement", () => ({
    name: "different_name",
    parameters: { type: "object" },
    execute() {},
  }));
  assert.throws(
    () => registry.createTools({ root: process.cwd() }),
    /returned mismatched name/,
  );
});
