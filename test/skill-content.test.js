import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeSkillName,
  skillDraft,
  syncSkillContentName,
  validateSkillContent,
} from "../public/lib/skill-content.js";

test("new skill drafts include required frontmatter and instructions", () => {
  const draft = skillDraft("Review Pull Request");
  assert.match(draft, /^---\nname: review-pull-request\ndescription: .+\n---/);
  assert.match(draft, /# Instructions/);
  assert.equal(validateSkillContent(draft), draft);
});

test("editing a skill updates its name while preserving metadata and body", () => {
  const content = `---
name: old-name
description: Existing description
metadata:
  short-description: Existing UI label
---

# Workflow

Keep these instructions.
`;
  const updated = syncSkillContentName(content, "New Name");
  assert.match(updated, /name: new-name/);
  assert.match(updated, /metadata:\n  short-description: Existing UI label/);
  assert.match(updated, /Keep these instructions\./);
});

test("skill names normalize to lowercase hyphenated folder names", () => {
  assert.equal(normalizeSkillName("  My Skill / Helper  "), "my-skill-helper");
  assert.equal(normalizeSkillName("---"), "");
});
