import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createSkillOnDisk, loadSkillsFromDisk } from "../lib/skills.js";

test("creating a skill writes a discoverable SKILL.md with required metadata", async () => {
  const rootDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "ai-harness-skills-"));
  const skillsDirectory = path.join(rootDirectory, "skills");
  try {
    const created = await createSkillOnDisk({
      name: "Review Pull Request",
      rootDirectory,
      skillsDirectory,
    });
    const content = await fs.readFile(created.sourcePath, "utf8");
    assert.equal(created.id, "skills/review-pull-request");
    assert.match(content, /^---\nname: review-pull-request\ndescription: .+\n---/);
    const discovered = await loadSkillsFromDisk(rootDirectory);
    assert.equal(discovered[0].name, "review-pull-request");
  } finally {
    await fs.rm(rootDirectory, { recursive: true, force: true });
  }
});
