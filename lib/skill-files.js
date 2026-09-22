import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { normalizeSkillName, validateSkillContent } from "../public/lib/skill-content.js";

const RESOURCE_DIRS = new Set(["scripts", "references", "templates", "examples"]);
const MAX_FILE_BYTES = 2_000_000;

export function skillsRootForDatabase(databasePath) {
  const databaseDir = path.dirname(path.resolve(databasePath));
  return path.join(path.basename(databaseDir) === "db" ? path.dirname(databaseDir) : databaseDir, "skills");
}

function skillName(value) {
  const name = normalizeSkillName(value);
  if (!name || name !== String(value)) throw new Error("Skill name must use lowercase letters, numbers, and hyphens.");
  return name;
}

function resourcePath(value) {
  const relative = String(value || "").replaceAll("\\", "/");
  const parts = relative.split("/");
  if (relative === "SKILL.md") return relative;
  if (parts.length < 2 || !RESOURCE_DIRS.has(parts[0]) || parts.some((part) => !part || part === "." || part === ".." || /[\x00-\x1f:]/.test(part))) {
    throw new Error("Resource paths must be inside scripts/, references/, templates/, or examples/.");
  }
  return relative;
}

function metadata(content) {
  validateSkillContent(content);
  const frontmatter = content.match(/^---\n([\s\S]*?)\n---(?:\n|$)/)[1];
  const value = (key) => frontmatter.match(new RegExp(`^${key}\\s*:\\s*(.+)$`, "m"))?.[1]?.trim().replace(/^(["'])(.*)\1$/, "$2") || "";
  return { name: value("name"), description: value("description") };
}

function fileFor(root, name, relative) {
  const file = path.join(root, skillName(name), resourcePath(relative));
  const parent = path.join(root, name);
  if (!file.startsWith(`${parent}${path.sep}`)) throw new Error("Invalid skill resource path.");
  let cursor = parent;
  for (const segment of path.relative(parent, file).split(path.sep)) {
    cursor = path.join(cursor, segment);
    if (fs.existsSync(cursor) && fs.lstatSync(cursor).isSymbolicLink()) throw new Error("Skill resources cannot follow symlinks.");
  }
  return file;
}

function listFiles(directory, prefix = "") {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...listFiles(path.join(directory, entry.name), relative));
    else if (entry.isFile() && relative !== "SKILL.md") files.push(relative);
  }
  return files.sort();
}

export function createSkillFileStore(root) {
  fs.mkdirSync(root, { recursive: true });
  const list = () => fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.name))
    .map((entry) => {
      const name = entry.name;
      const file = path.join(root, name, "SKILL.md");
      if (!fs.existsSync(file)) return null;
      const content = fs.readFileSync(file, "utf8");
      let description = "";
      let valid = true;
      try { description = metadata(content).description; } catch { valid = false; }
      return { id: name, name, description, content, resources: listFiles(path.join(root, name)), path: file, valid, updatedAt: fs.statSync(file).mtimeMs };
    }).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));

  function write(name, content, { create = false } = {}) {
    const id = skillName(name);
    const data = String(content || "").replace(/\r\n?/g, "\n");
    if (Buffer.byteLength(data) > MAX_FILE_BYTES) throw new Error("SKILL.md is too large.");
    const frontmatter = metadata(data);
    if (frontmatter.name !== id) throw new Error("SKILL.md frontmatter name must match its folder name.");
    const directory = path.join(root, id);
    if (create) fs.mkdirSync(directory);
    else if (!fs.statSync(directory).isDirectory()) throw new Error(`Unknown skill: ${id}`);
    const target = path.join(directory, "SKILL.md");
    const temporary = `${target}.tmp-${process.pid}-${Date.now()}`;
    try { fs.writeFileSync(temporary, data, { flag: "wx" }); fs.renameSync(temporary, target); }
    catch (error) { try { fs.unlinkSync(temporary); } catch {} throw error; }
    return { id, name: id, description: frontmatter.description, content: data, resources: listFiles(directory), path: target, valid: true, updatedAt: fs.statSync(target).mtimeMs };
  }

  function readResource(name, relative) {
    const file = fileFor(root, name, relative);
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES) throw new Error("Resource is unavailable or too large.");
    const data = fs.readFileSync(file);
    const content = data.toString("utf8");
    if (!Buffer.from(content, "utf8").equals(data)) throw new Error("Binary resources can be imported and used from disk, but cannot be edited as text here.");
    return content;
  }

  function rename(oldName, newName, content) {
    const source = path.join(root, skillName(oldName));
    const target = path.join(root, skillName(newName));
    if (!fs.existsSync(source)) throw new Error(`Unknown skill: ${oldName}`);
    if (source !== target) {
      if (fs.existsSync(target)) throw new Error(`A skill named ${newName} already exists.`);
      fs.renameSync(source, target);
    }
    try { return write(newName, content); }
    catch (error) { if (source !== target) fs.renameSync(target, source); throw error; }
  }

  function writeResource(name, relative, content) {
    const file = fileFor(root, name, relative);
    if (relative === "SKILL.md") return write(name, content);
    if (!fs.existsSync(path.join(root, skillName(name), "SKILL.md"))) throw new Error(`Unknown skill: ${name}`);
    const data = Buffer.isBuffer(content) ? content : Buffer.from(String(content || ""), "utf8");
    if (data.length > MAX_FILE_BYTES) throw new Error("Resource is too large.");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, data);
  }

  function importFiles(files) {
    if (!Array.isArray(files) || !files.length || files.length > 200) throw new Error("Choose a skill folder with SKILL.md and up to 199 resources.");
    const normalized = files.map((entry) => ({
      path: String(entry.path || "").replaceAll("\\", "/"),
      content: entry.encoding === "base64" ? Buffer.from(String(entry.content || ""), "base64") : Buffer.from(String(entry.content || ""), "utf8"),
    }));
    const rootParts = normalized.map((entry) => entry.path.split("/")[0]);
    const hasFolder = normalized.every((entry) => entry.path.includes("/")) && new Set(rootParts).size === 1;
    const entries = normalized.map((entry) => ({ ...entry, path: hasFolder ? entry.path.slice(rootParts[0].length + 1) : entry.path }));
    const manifest = entries.find((entry) => entry.path === "SKILL.md");
    if (!manifest) throw new Error("Import requires SKILL.md at the skill folder root.");
    const name = skillName(metadata(manifest.content.toString("utf8")).name);
    const paths = new Set();
    for (const entry of entries) {
      resourcePath(entry.path);
      if (paths.has(entry.path)) throw new Error(`Duplicate resource: ${entry.path}`);
      if (entry.content.length > MAX_FILE_BYTES) throw new Error(`Resource is too large: ${entry.path}`);
      paths.add(entry.path);
    }
    if (fs.existsSync(path.join(root, name))) throw new Error(`A skill named ${name} already exists.`);
    write(name, manifest.content.toString("utf8"), { create: true });
    for (const entry of entries) if (entry.path !== "SKILL.md") writeResource(name, entry.path, entry.content);
    return list().find((skill) => skill.id === name);
  }

  function test(name) {
    const skill = list().find((entry) => entry.id === name);
    if (!skill) throw new Error(`Unknown skill: ${name}`);
    const checks = [];
    try {
      const info = metadata(skill.content);
      if (info.name !== name) throw new Error("Frontmatter name does not match folder name.");
      checks.push({ path: "SKILL.md", ok: true, message: "Metadata and Markdown structure are valid." });
    } catch (error) { checks.push({ path: "SKILL.md", ok: false, message: error.message }); }
    for (const match of skill.content.matchAll(/\]\(([^)#]+)(?:#[^)]*)?\)/g)) {
      const reference = match[1].replace(/^\.\//, "");
      if (!/^(scripts|references|templates|examples)\//.test(reference)) continue;
      const present = skill.resources.includes(reference);
      checks.push({ path: reference, ok: present, message: present ? "Referenced file exists." : "Referenced file is missing." });
    }
    for (const relative of skill.resources) {
      if (!/\.(?:js|mjs|cjs)$/.test(relative)) continue;
      const result = spawnSync(process.execPath, ["--check", fileFor(root, name, relative)], { encoding: "utf8", timeout: 10_000 });
      checks.push({ path: relative, ok: result.status === 0, message: (result.stderr || result.stdout || "Syntax OK").trim() });
    }
    return { ok: checks.every((check) => check.ok), checks };
  }

  return { root, list, write, rename, readResource, writeResource, importFiles, test };
}
