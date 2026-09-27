import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { installSkill, parseSkillInstallCommand } from "../lib/skill-install.js";
import { skillDraft } from "../public/lib/skill-content.js";

const command = "npx skills add https://github.com/anthropics/skills --skill frontend-design";
test("install command accepts GitHub commands and rejects shell syntax and extra flags", () => {
  assert.deepEqual(parseSkillInstallCommand(command), { source: "https://github.com/anthropics/skills", name: "frontend-design" });
  assert.equal(parseSkillInstallCommand("npx skills add anthropics/skills --skill frontend-design").name, "frontend-design");
  for (const value of [command + " ; touch /tmp/test", command + " --global", "npx skills add /tmp/repo --skill demo", "npx skills add https://evil.test/repo --skill demo", command.replace("frontend-design", "../../outside"), null]) {
    assert.throws(() => parseSkillInstallCommand(value), /Use:/);
  }
});

test("installer copies a validated skill with resources, avoids overwrite, and cleans staging", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "skill-install-test-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const run = async (executable, args, options) => {
    assert.equal(executable, "npx");
    assert.deepEqual(args, ["--yes", "skills", "add", "https://github.com/anthropics/skills", "--skill", "frontend-design", "--agent", "claude-code", "--copy", "--yes"]);
    assert.equal(options.shell, undefined);
    const output = path.join(options.cwd, ".claude/skills/frontend-design");
    await fs.mkdir(path.join(output, "assets"), { recursive: true });
    await fs.writeFile(path.join(output, "SKILL.md"), skillDraft("frontend-design"));
    await fs.writeFile(path.join(output, "assets/icon.bin"), Buffer.from([0, 255]));
  };
  const skill = await installSkill(root, command, { run });
  assert.equal(skill.id, "frontend-design");
  assert.deepEqual(await fs.readFile(path.join(root, "frontend-design/assets/icon.bin")), Buffer.from([0, 255]));
  assert.deepEqual(await fs.readdir(root), ["frontend-design"]);
  await assert.rejects(installSkill(root, command, { run }), /already exists/);
});

test("failed, missing, and unsafe installs leave no partial skill", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "skill-install-test-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await assert.rejects(installSkill(root, command, { run: async () => { throw new Error("offline"); } }), /offline/);
  await assert.rejects(installSkill(root, command, { run: async () => {} }), /did not produce/);
  await assert.rejects(installSkill(root, command, { run: async (_, __, { cwd }) => {
    const output = path.join(cwd, ".claude/skills/frontend-design");
    await fs.mkdir(output, { recursive: true });
    await fs.symlink("/tmp", path.join(output, "escape"));
  } }), /symlinks/);
  assert.deepEqual(await fs.readdir(root), []);
});
