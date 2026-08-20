import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_IGNORED_NAMES = new Set([".git", ".ai-harness", ".ai-harness-conversation", "node_modules", "db"]);

async function createWorkspaceTree(root, { limit = 2500, ignoredNames = DEFAULT_IGNORED_NAMES } = {}) {
  let count = 0;

  async function visit(directory) {
    let entries;
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error.code === "EACCES" || error.code === "EPERM") return [];
      throw error;
    }

    const nodes = [];
    const directories = [];
    const sortedEntries = entries
      .filter((entry) => !ignoredNames.has(entry.name))
      .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));

    // Reserve siblings before descending so a large early folder cannot hide
    // the remaining entries in the directory when the global limit is reached.
    for (const entry of sortedEntries) {
      if (count >= limit) break;
      count += 1;
      const absolute = path.join(directory, entry.name);
      const node = entry.isDirectory()
        ? { name: entry.name, path: absolute, type: "directory", children: [] }
        : { name: entry.name, path: absolute, type: "file" };
      nodes.push(node);
      if (entry.isDirectory()) directories.push(node);
    }

    for (const node of directories) {
      if (count >= limit) break;
      node.children = await visit(node.path);
    }
    return nodes;
  }

  return visit(root);
}

export { createWorkspaceTree };
