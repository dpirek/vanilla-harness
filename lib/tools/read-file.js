import fs from "node:fs/promises";

import { MAX_OUTPUT, objectSchema } from "./shared.js";

function createReadFileTool({ relativePath, resolvePath }) {
  return {
    name: "read_file",
    validatesWorkspace: true,
    description: "Read a UTF-8 text file, optionally selecting a line range.",
    parameters: objectSchema({
      path: { type: "string", description: "Workspace-relative file path." },
      start_line: { type: ["integer", "null"], description: "First line, 1-based, or null." },
      end_line: { type: ["integer", "null"], description: "Last line, inclusive, or null." },
    }),
    async execute({ path: requested, start_line: start, end_line: end }) {
      const target = resolvePath(requested);
      const content = await fs.readFile(target, "utf8");
      const lines = content.split("\n");
      // Clamp requested line ranges so out-of-range input stays harmless.
      const from = Math.max(1, start || 1);
      const to = Math.min(lines.length, end || lines.length);
      const selected = lines.slice(from - 1, to).join("\n");
      return {
        ok: true,
        path: relativePath(target),
        start_line: from,
        end_line: to,
        content: selected.slice(0, MAX_OUTPUT),
        truncated: selected.length > MAX_OUTPUT,
      };
    },
  };
}

export { createReadFileTool };
