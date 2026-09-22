import assert from "node:assert/strict";
import { test } from "node:test";
import { toolsTabFromPath, toolsTabPath } from "../public/lib/tool-routes.js";

test("Tools tabs have direct routes and /tools opens permissions", () => {
  assert.equal(toolsTabFromPath("/tools"), "permissions");
  assert.equal(toolsTabFromPath("/tools/"), "permissions");
  for (const tab of ["permissions", "files", "runtime", "test"]) {
    assert.equal(toolsTabFromPath(toolsTabPath(tab)), tab);
    assert.equal(toolsTabFromPath(`${toolsTabPath(tab)}/`), tab);
  }
  assert.equal(toolsTabFromPath("/tools/unknown"), null);
  assert.equal(toolsTabFromPath("/tools/files/extra"), null);
});
