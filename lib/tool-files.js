import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const packageToolsRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../tools");

const BUILTINS = [
  ["list_files", "List files", "List files and folders inside the workspace.", "file-access"],
  ["search_files", "Search files", "Search workspace text files with a regular expression.", "file-access"],
  ["read_file", "Read files", "Read selected UTF-8 file contents from the workspace.", "file-access"],
  ["write_file", "Write files", "Create or replace UTF-8 files inside the workspace.", "file-access"],
  ["edit_files", "Exact edits", "Unique replacements across files with durable recovery.", "file-access"],
  ["change_history", "Change history", "Review, undo, and redo tracked file changes.", "file-access"],
  ["javascript", "JavaScript tools", "Node syntax checks, import hints, and lexical symbol/reference lookup.", "code-inspection"],
  ["search_skills", "Search skills", "Find skill guides by name and description without loading them.", "code-inspection"],
  ["read_skill_resource", "Read skill resource", "Load a SKILL.md guide or its supporting files.", "code-inspection"],
  ["curl", "Curl", "Fetch HTTP or HTTPS URLs for API and web inspection.", "web-access"],
  ["chrome_devtools", "Chrome DevTools", "Browse pages, inspect source, run JavaScript, and save screenshots.", "web-access"],
  ["run_command", "Run commands", "Run shell commands in the workspace.", "execution"],
  ["delegate_to_sub_agent", "Sub-agent delegation", "Delegate tasks to configured Agent Workers.", "execution"],
];
const builtinNames = new Set(BUILTINS.map(([name]) => name));
const BUILTIN_ORDER = ["list_files", "read_file", "read_skill_resource", "search_skills", "write_file", "search_files", "curl", "run_command", "chrome_devtools", "delegate_to_sub_agent", "edit_files", "change_history", "javascript"];
const NAME = /^[a-z][a-z0-9_]{0,63}$/;

export function toolsRootForDatabase(databasePath) {
  const databaseDir = path.dirname(path.resolve(databasePath));
  return path.join(path.basename(databaseDir) === "db" ? path.dirname(databaseDir) : databaseDir, "tools");
}

export function validateToolManifest(value) {
  const data = typeof value === "string" ? JSON.parse(value) : value;
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("TOOL.json must contain an object.");
  const { name, kind, title, description, group } = data;
  if (typeof name !== "string" || !NAME.test(name)) throw new Error("Tool name must use lowercase letters, numbers, and underscores.");
  if (!["builtin", "module", "command"].includes(kind)) throw new Error("Tool kind must be builtin, module, or command.");
  if ((kind === "builtin") !== builtinNames.has(name)) throw new Error("Built-in names must retain the builtin kind; new tools use module or command.");
  if (typeof title !== "string" || !title.trim() || typeof description !== "string" || !description.trim()) throw new Error("Tool title and description are required.");
  if (typeof group !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(group)) throw new Error("Tool group must use lowercase letters and hyphens.");
  if (kind === "command") {
    if (typeof data.command !== "string" || !data.command.trim()) throw new Error("Command tools require a command executable.");
    if (!Array.isArray(data.args) || data.args.some((arg) => typeof arg !== "string")) throw new Error("Command tool args must be a string array.");
    if (data.timeoutMs !== undefined && (!Number.isInteger(data.timeoutMs) || data.timeoutMs < 100 || data.timeoutMs > 120000)) throw new Error("timeoutMs must be between 100 and 120000.");
  }
  if (kind !== "command" && (typeof data.entry !== "string" || !/^(?!\.)(?!.*\/\.)(?!.*\\)[a-zA-Z0-9_/-]+\.js$/.test(data.entry))) throw new Error("Module tools require a relative .js entry within their folder.");
  return data;
}

export function createToolFileStore(root) {
  fs.mkdirSync(root, { recursive: true });
  for (const [name, title, description, group] of BUILTINS) {
    const dir = path.join(root, name.replaceAll("_", "-"));
    const oldDir = path.join(root, name);
    if (oldDir !== dir && fs.existsSync(oldDir) && !fs.existsSync(dir)) fs.renameSync(oldDir, dir);
    if (fs.existsSync(dir) && fs.lstatSync(dir).isSymbolicLink()) throw new Error("Tool folders cannot be links.");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "TOOL.json");
    if (fs.existsSync(file) && fs.lstatSync(file).isSymbolicLink()) throw new Error("Tool manifests cannot be links.");
    if (!fs.existsSync(file)) fs.writeFileSync(file, `${JSON.stringify({ name, kind: "builtin", title, description, group, entry: "index.js", order: BUILTIN_ORDER.indexOf(name) }, null, 2)}\n`);
    else {
      const data = JSON.parse(fs.readFileSync(file, "utf8"));
      if (data.kind === "builtin" && !data.entry) {
        data.entry = "index.js";
        data.order = BUILTIN_ORDER.indexOf(name);
        fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
      }
    }
  }
  function fileFor(name) {
    if (typeof name !== "string" || !NAME.test(name)) throw new Error("Invalid tool name.");
    const dir = path.join(root, name.replaceAll("_", "-"));
    if (fs.existsSync(dir) && fs.lstatSync(dir).isSymbolicLink()) throw new Error("Tool folders cannot be links.");
    return path.join(dir, "TOOL.json");
  }
  function list() {
    return fs.readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => {
      const file = fileFor(entry.name.replaceAll("-", "_"));
      if (!fs.existsSync(file)) return null;
      if (fs.lstatSync(file).isSymbolicLink()) throw new Error("Tool manifests cannot be links.");
      const tool = validateToolManifest(fs.readFileSync(file, "utf8"));
      if (tool.name.replaceAll("_", "-") !== entry.name) throw new Error(`Tool folder and manifest name differ: ${entry.name}`);
      return tool;
    }).filter(Boolean).sort((a, b) => (a.order ?? 1000) - (b.order ?? 1000) || a.title.localeCompare(b.title));
  }
  function write(content, { create = false } = {}) {
    const data = validateToolManifest(content);
    const file = fileFor(data.name);
    if (fs.existsSync(file) && fs.lstatSync(file).isSymbolicLink()) throw new Error("Tool manifests cannot be links.");
    if (fs.existsSync(file) === create) throw new Error(create ? `Tool ${data.name} already exists.` : `Unknown tool: ${data.name}`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
    return data;
  }
  function resourceFile(name, resource) {
    if (typeof resource !== "string" || !resource.split("/").every((part) => part && part !== "." && part !== ".." && /^[A-Za-z0-9_.-]+$/.test(part))) throw new Error("Invalid tool resource path.");
    const localFolder = path.dirname(fileFor(name));
    const packageFolder = path.join(packageToolsRoot, name.replaceAll("_", "-"));
    const folder = builtinNames.has(name) && !fs.existsSync(path.join(localFolder, resource)) && fs.existsSync(path.join(packageFolder, resource))
      ? packageFolder : localFolder;
    const target = path.join(folder, resource);
    let current = folder;
    for (const part of resource.split("/")) {
      current = path.join(current, part);
      if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw new Error("Tool resources cannot be links.");
    }
    return target;
  }
  function test(content, source) {
    const tool = validateToolManifest(content);
    if (tool.kind !== "command" && typeof source === "string") {
      const result = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: source, encoding: "utf8", timeout: 5000, maxBuffer: 1024 * 1024 });
      if (result.status !== 0) throw new Error(result.stderr?.trim() || result.error?.message || "Module syntax check failed.");
    }
    return { valid: true, name: tool.name, kind: tool.kind, message: tool.kind === "command" ? "Manifest is valid. Commands are not executed by this test." : "Manifest and module syntax are valid. The tool was not executed." };
  }
  function importFiles(files) {
    if (!Array.isArray(files) || !files.length) throw new Error("Choose a tool folder to import.");
    const manifestFile = files.find((file) => file.path === "TOOL.json");
    if (!manifestFile) throw new Error("The folder needs TOOL.json.");
    const manifest = validateToolManifest(manifestFile.content);
    const destination = fileFor(manifest.name);
    if (fs.existsSync(destination)) throw new Error(`Tool ${manifest.name} already exists.`);
    const names = new Set();
    for (const file of files) {
      if (typeof file.content !== "string" || Buffer.byteLength(file.content) > 2_000_000) throw new Error("Tool files must be text smaller than 2 MB.");
      resourceFile(manifest.name, file.path);
      if (names.has(file.path)) throw new Error(`Duplicate tool file: ${file.path}`);
      names.add(file.path);
    }
    if (manifest.kind !== "command" && !names.has(manifest.entry)) throw new Error(`The folder needs ${manifest.entry}.`);
    for (const file of files) {
      const target = resourceFile(manifest.name, file.path);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, file.path === "TOOL.json" ? `${JSON.stringify(manifest, null, 2)}\n` : file.content);
    }
    return manifest;
  }
  return {
    root, list, write, test, importFiles,
    read(name) { const file = fileFor(name); return validateToolManifest(fs.readFileSync(file, "utf8")); },
    readResource(name, resource) { return fs.readFileSync(resourceFile(name, resource), "utf8"); },
    writeResource(name, resource, content) {
      if (typeof content !== "string" || Buffer.byteLength(content) > 2_000_000) throw new Error("Tool resource must be text smaller than 2 MB.");
      const target = resourceFile(name, resource);
      if (!fs.existsSync(fileFor(name))) throw new Error(`Unknown tool: ${name}`);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content);
    },
  };
}
