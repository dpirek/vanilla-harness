import fs from "node:fs/promises";
import path from "node:path";

import { objectSchema } from "./shared.js";

function createWriteFileTool({ approve, relativePath, resolvePath }) {
  return {
    name: "write_file",
    mutatesWorkspace: true,
    description: "Create or replace a UTF-8 text file inside the workspace.",
    parameters: objectSchema({
      path: { type: "string", description: "Workspace-relative file path." },
      content: { type: "string", description: "Complete new file content." },
    }),
    async execute({ path: requested, content }) {
      const target = resolvePath(requested);
      // The caller controls whether workspace mutations are authorized.
      if (!(await approve(`write to ${relativePath(target)}`))) {
        return { ok: false, error: "User denied file write." };
      }
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, content, "utf8");
      // Verify the persisted bytes before telling the model the mutation
      // succeeded. This catches partial or unexpected writes immediately.
      const persisted = await fs.readFile(target, "utf8");
      if (persisted !== content) {
        return { ok: false, error: `File verification failed: ${relativePath(target)}` };
      }
      return {
        ok: true,
        path: relativePath(target),
        bytes: Buffer.byteLength(content),
        verified: true,
      };
    },
  };
}

export { createWriteFileTool };
