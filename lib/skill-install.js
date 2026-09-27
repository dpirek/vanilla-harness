import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createSkillFileStore } from "./skill-files.js";

const runFile = promisify(execFile);
const pending = new Set();

export function parseSkillInstallCommand(command) {
  const match = typeof command === "string" && command.trim().match(/^npx skills add (https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/?|[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+) --skill ([a-z0-9]+(?:-[a-z0-9]+)*)$/);
  if (!match || match[2].length > 63) throw new Error("Use: npx skills add https://github.com/owner/repo --skill skill-name");
  return { source: match[1], name: match[2] };
}

async function checkTree(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile())) throw new Error("Installed skills cannot contain symlinks or special files.");
    if (entry.isDirectory()) await checkTree(path.join(directory, entry.name));
  }
}

export async function installSkill(root, command, { run = runFile } = {}) {
  const { source, name } = parseSkillInstallCommand(command);
  const destination = path.resolve(root, name);
  if (pending.has(destination)) throw new Error(`Installation of ${name} is already in progress.`);
  pending.add(destination);
  let temporary;
  try {
    await fs.mkdir(root, { recursive: true });
    const exists = await fs.lstat(destination).then(() => true, (error) => { if (error.code === "ENOENT") return false; throw error; });
    if (exists) throw new Error(`A skill named ${name} already exists.`);
    temporary = await fs.mkdtemp(path.join(root, ".install-"));
    try {
      await run("npx", ["--yes", "skills", "add", source, "--skill", name, "--agent", "claude-code", "--copy", "--yes"], {
        cwd: temporary, timeout: 180_000, maxBuffer: 2_000_000,
        env: { ...process.env, CI: "1", DISABLE_TELEMETRY: "1", GIT_TERMINAL_PROMPT: "0" },
      });
    } catch (error) {
      if (error.code === "ENOENT") throw new Error("Installing skills requires Node.js and npx on the server PATH.");
      if (error.killed) throw new Error("Skill installation timed out. Please try again.");
      throw new Error(`Skill installation failed: ${String(error.stderr || error.stdout || error.message).replace(/\x1b\[[0-9;]*m/g, "").trim().slice(-2000)}`);
    }
    const installedRoot = path.join(temporary, ".claude", "skills");
    const installed = path.join(installedRoot, name);
    const stat = await fs.lstat(installed).catch(() => null);
    if (!stat?.isDirectory() || stat.isSymbolicLink()) throw new Error(`The installer did not produce ${name}. Check the repository and skill name.`);
    await checkTree(installed);
    createSkillFileStore(installedRoot).read(name);
    // Recheck after the download so an intervening manual import is never overwritten.
    if (await fs.lstat(destination).then(() => true, () => false)) throw new Error(`A skill named ${name} already exists.`);
    await fs.rename(installed, destination);
    return createSkillFileStore(root).read(name);
  } finally {
    if (temporary) await fs.rm(temporary, { recursive: true, force: true });
    pending.delete(destination);
  }
}
