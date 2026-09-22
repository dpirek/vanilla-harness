import fs from "node:fs/promises";
import path from "node:path";
import { checkJavaScript } from "../../lib/javascript-tools.js";
import { inferredWriteFilePath } from "../../lib/tool-default-paths.js";

import { objectSchema } from "../../lib/tools/shared.js";

function createWriteFileTool({ approve, relativePath, resolvePath, changes, workspace, settings }) {
  return {
    name: "write_file",
    mutatesWorkspace: true,
    description: "Create or replace a UTF-8 text file inside the workspace. A full HTML document without a path creates index.html; a stylesheet without a path uses the CSS filename or linked stylesheet in index.html. Inferred paths never overwrite existing files.",
    parameters: objectSchema({
      path: { type: "string", description: "Workspace-relative file path. Required except for a new index.html HTML document or a CSS stylesheet whose path can be inferred." },
      content: { type: "string", description: "Complete new file content." },
      expected_hash: { type: ["string", "null"], description: "SHA-256 from read_file to reject stale writes, or null." },
    }, ["content"]),
    async execute(args = {}, { signal } = {}) {
      signal?.throwIfAborted();
      const inferredPath = args.inferredPath === true ? args.path : await inferredWriteFilePath(args, workspace);
      const inferred = Boolean(inferredPath);
      const requested = args.path || inferredPath;
      const { content, expected_hash } = args;
      if (!requested) throw new Error("A file path is required unless HTML or CSS identifies a new destination.");
      const target = resolvePath(requested);
      // The caller controls whether workspace mutations are authorized.
      if (!(await approve(`write to ${relativePath(target)}`))) {
        return { ok: false, error: "User denied file write." };
      }
      signal?.throwIfAborted();
      if (inferred) {
        try {
          await fs.stat(target);
          throw new Error(`${requested} already exists. Provide an explicit path to replace an existing file.`);
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
        }
      }
      if (changes) {
        const edit = inferred
          ? { path: requested, old_text: "", new_text: content, expected_hash: null }
          : { path: requested, content, expected_hash };
        const result = await changes.apply([edit], { signal, label: 'Write file' });
        if (settings?.().javascript.checkAfterEdit) {
          try { result.diagnostics = await checkJavaScript(workspace, requested, { signal }); }
          catch (error) { result.diagnostics = { ok: false, error: error.message }; }
        }
        return { ...result, path: relativePath(target), bytes: Buffer.byteLength(content), verified: true };
      }
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, content, { encoding: "utf8", signal, flag: inferred ? "wx" : "w" });
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
