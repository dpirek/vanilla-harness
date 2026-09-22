import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createSkillFileStore } from "../lib/skill-files.js";
import { createReadSkillResourceTool } from "../lib/tools/read-skill-resource.js";
import { skillDraft } from "../public/lib/skill-content.js";

test("skill folders import, edit resources, and validate scripts", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "harness-skill-folders-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const store = createSkillFileStore(path.join(directory, "skills"));
  const imported = store.importFiles([
    { path: "demo/SKILL.md", content: skillDraft("demo") },
    { path: "demo/examples/example.md", content: "Example" },
    { path: "demo/scripts/check.js", content: "const answer = 42;\n" },
    { path: "demo/examples/icon.png", content: Buffer.from([0, 255, 0]).toString("base64"), encoding: "base64" },
  ]);
  assert.deepEqual(imported.resources, ["examples/example.md", "examples/icon.png", "scripts/check.js"]);
  assert.deepEqual(await fs.readFile(path.join(directory, "skills/demo/examples/icon.png")), Buffer.from([0, 255, 0]));
  assert.equal(store.readResource("demo", "examples/example.md"), "Example");
  const tool = createReadSkillResourceTool({ store: {
    getSelectedSkills: () => [{ id: "demo" }],
    getSkillResource: (name, resource) => store.readResource(name, resource),
  } });
  assert.equal((await tool.execute({ skill: "demo", resource: "examples/example.md" })).content, "Example");
  assert.equal(store.test("demo").ok, true);
  store.writeResource("demo", "scripts/check.js", "const = ;");
  assert.equal(store.test("demo").ok, false);
  assert.throws(() => store.writeResource("demo", "../outside.md", "unsafe"), /Resource paths/);
  assert.throws(() => store.writeResource("demo", "scripts/../../outside.md", "unsafe"), /Resource paths/);
});
