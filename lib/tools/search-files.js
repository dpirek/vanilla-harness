import fs from "node:fs/promises";
import path from "node:path";

import { objectSchema } from "./shared.js";

function createSearchFilesTool({ relativePath, resolvePath }) {
  return {
    name: "search_files",
    description: "Search text files recursively using a JavaScript regular expression.",
    parameters: objectSchema({
      query: { type: "string", description: "JavaScript regular expression." },
      path: { type: "string", description: "Workspace-relative directory or file." },
    }),
    async execute({ query, path: requested }) {
      const pattern = new RegExp(query, "i");
      const start = resolvePath(requested);
      const matches = [];
      const ignored = new Set([".git", "node_modules", ".ai-harness", "db"]);

      // Recursive search is implemented directly to avoid shelling out to grep
      // or depending on ripgrep. Size and count limits keep results bounded.
      async function visit(target) {
        if (matches.length >= 200) return;
        const stat = await fs.stat(target);
        if (stat.isDirectory()) {
          for (const entry of await fs.readdir(target, { withFileTypes: true })) {
            if (ignored.has(entry.name)) continue;
            await visit(path.join(target, entry.name));
          }
          return;
        }
        if (stat.size > 1_000_000) return;
        let content;
        try {
          content = await fs.readFile(target, "utf8");
        } catch {
          return;
        }
        if (content.includes("\0")) return;
        content.split("\n").forEach((line, index) => {
          if (matches.length < 200 && pattern.test(line)) {
            matches.push(`${relativePath(target)}:${index + 1}:${line.slice(0, 500)}`);
          }
          pattern.lastIndex = 0;
        });
      }

      await visit(start);
      return { ok: true, matches, truncated: matches.length >= 200 };
    },
  };
}

export { createSearchFilesTool };
