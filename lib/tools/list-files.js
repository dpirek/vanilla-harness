import fs from "node:fs/promises";

import { objectSchema } from "./shared.js";

function createListFilesTool({ resolvePath }) {
  return {
    name: "list_files",
    description: "List files and directories in a workspace directory.",
    parameters: objectSchema({
      path: { type: "string", description: "Workspace-relative directory path." },
    }),
    async execute({ path: requested }) {
      // withFileTypes avoids extra stat calls when building dir/file labels.
      const target = resolvePath(requested);
      const entries = await fs.readdir(target, { withFileTypes: true });
      return {
        ok: true,
        entries: entries
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((entry) => `${entry.isDirectory() ? "dir" : "file"}\t${entry.name}`),
      };
    },
  };
}

export { createListFilesTool };
