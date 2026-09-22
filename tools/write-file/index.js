import fs from "node:fs/promises";
import path from "node:path";
import { checkJavaScript } from "../../lib/javascript-tools.js";

import { objectSchema } from "../../lib/tools/shared.js";

function createWriteFileTool({ approve, relativePath, resolvePath, changes, workspace, settings }) {
  return {
    name: "write_file",
    mutatesWorkspace: true,
    description: "Create or replace a UTF-8 text file inside the workspace.",
    parameters: objectSchema({
      path: { type: "string", description: "Workspace-relative file path." },
      content: { type: "string", description: "Complete new file content." },
      expected_hash: { type: ["string", "null"], description: "SHA-256 from read_file to reject stale writes, or null." },
    }),
    async execute({ path: requested, content, expected_hash }, { signal } = {}) {
      signal?.throwIfAborted();
      const target = resolvePath(requested);
      // The caller controls whether workspace mutations are authorized.
      if (!(await approve(`write to ${relativePath(target)}`))) {
        return { ok: false, error: "User denied file write." };
      }
      signal?.throwIfAborted();
      if (changes) {
        const result = await changes.apply([{ path: requested, content, expected_hash }], { signal, label: 'Write file' });
        if (settings?.().javascript.checkAfterEdit) {
          try { result.diagnostics = await checkJavaScript(workspace, requested, { signal }); }
          catch (error) { result.diagnostics = { ok: false, error: error.message }; }
        }
        return { ...result, path: relativePath(target), bytes: Buffer.byteLength(content), verified: true };
      }
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, content, { encoding: "utf8", signal });
      const persisted = await fs.readFile(target, "utf8");
      if (persisted !== content) throw new Error('File verification failed.');
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

export { createWriteFileTool as createTool };
