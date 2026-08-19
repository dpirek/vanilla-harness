function normalizeSkillName(value = "") {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63)
    .replace(/-+$/g, "");
}

function skillDraft(name = "new-skill") {
  const normalizedName = normalizeSkillName(name) || "new-skill";
  return `---
name: ${normalizedName}
description: Describe what this skill does and the situations that should trigger it.
---

# Instructions

Describe the exact workflow the agent should follow.
`;
}

function syncSkillContentName(content, name) {
  const normalizedName = normalizeSkillName(name);
  if (!normalizedName) throw new Error("Enter a skill name using letters, numbers, and hyphens.");
  const value = String(content || "").replace(/\r\n?/g, "\n");
  if (!value.startsWith("---\n")) return skillDraft(normalizedName).replace(
    "Describe the exact workflow the agent should follow.\n",
    `${value.trim()}\n`,
  );
  const closingIndex = value.indexOf("\n---", 4);
  if (closingIndex < 0) throw new Error("SKILL.md frontmatter is missing its closing ---.");
  const frontmatter = value.slice(4, closingIndex);
  const nextFrontmatter = /^name\s*:/m.test(frontmatter)
    ? frontmatter.replace(/^name\s*:.*$/m, `name: ${normalizedName}`)
    : `name: ${normalizedName}\n${frontmatter}`;
  return `---\n${nextFrontmatter}\n---${value.slice(closingIndex + 4)}`;
}

function validateSkillContent(content) {
  const value = String(content || "").replace(/\r\n?/g, "\n");
  const match = value.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  if (!match) throw new Error("SKILL.md must start with YAML frontmatter enclosed by ---.");
  if (!/^name\s*:\s*\S+/m.test(match[1])) throw new Error("SKILL.md frontmatter requires a name.");
  if (!/^description\s*:\s*\S+/m.test(match[1])) throw new Error("SKILL.md frontmatter requires a description.");
  return value;
}

export { normalizeSkillName, skillDraft, syncSkillContentName, validateSkillContent };
