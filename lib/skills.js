import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const CODEX_ROOT_DIRECTORY = path.join(os.homedir(), ".codex");
const USER_SKILLS_DIRECTORY = path.join(CODEX_ROOT_DIRECTORY, "skills");

async function walkSkillFiles(directory, results = []) {
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR" || error.code === "EACCES") {
      return results;
    }
    throw error;
  }

  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await walkSkillFiles(absolute, results);
      continue;
    }
    if (entry.isFile() && entry.name === "SKILL.md") results.push(absolute);
  }
  return results;
}

function skillIdFromPath(filePath, rootDirectory) {
  return path.relative(rootDirectory, filePath)
    .replace(/\\/g, "/")
    .replace(/\/SKILL\.md$/, "");
}

function skillNameFromPath(filePath) {
  return path.basename(path.dirname(filePath));
}

async function loadSkillsFromDisk(rootDirectory = path.join(os.homedir(), ".codex")) {
  const files = await walkSkillFiles(rootDirectory, []);
  const skills = await Promise.all(files.map(async (filePath) => {
    const [content, stat] = await Promise.all([
      fs.readFile(filePath, "utf8"),
      fs.stat(filePath),
    ]);
    return {
      id: skillIdFromPath(filePath, rootDirectory),
      name: skillNameFromPath(filePath),
      sourcePath: filePath,
      content,
      updatedAt: Math.round(Number(stat.mtimeMs) || Date.now()),
    };
  }));
  return skills.sort((a, b) => a.name.localeCompare(b.name) || a.sourcePath.localeCompare(b.sourcePath));
}

function slugifySkillName(name = "") {
  const normalized = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "new-skill";
}

async function nextAvailableSkillDirectory(baseDirectory, slug) {
  let attempt = slug;
  let suffix = 2;
  while (true) {
    try {
      await fs.access(path.join(baseDirectory, attempt));
      attempt = `${slug}-${suffix}`;
      suffix += 1;
    } catch (error) {
      if (error.code === "ENOENT") return attempt;
      throw error;
    }
  }
}

function defaultSkillContent(name = "") {
  const title = String(name || "New Skill").trim() || "New Skill";
  return `# ${title}

Describe when this skill should be used and the exact workflow it should follow.
`;
}

async function createSkillOnDisk({
  name,
  content = "",
  rootDirectory = CODEX_ROOT_DIRECTORY,
  skillsDirectory = USER_SKILLS_DIRECTORY,
} = {}) {
  const skillName = String(name || "").trim();
  if (!skillName) throw new Error("Skill name is required.");
  await fs.mkdir(skillsDirectory, { recursive: true });
  const slug = await nextAvailableSkillDirectory(skillsDirectory, slugifySkillName(skillName));
  const directory = path.join(skillsDirectory, slug);
  const filePath = path.join(directory, "SKILL.md");
  const fileContent = String(content || "").trim() ? String(content) : defaultSkillContent(skillName);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(filePath, fileContent, "utf8");
  const stat = await fs.stat(filePath);
  return {
    id: skillIdFromPath(filePath, rootDirectory),
    name: skillName,
    sourcePath: filePath,
    content: fileContent,
    updatedAt: Math.round(Number(stat.mtimeMs) || Date.now()),
  };
}

export {
  createSkillOnDisk,
  loadSkillsFromDisk,
};
