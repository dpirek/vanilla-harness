import { validateFileEdits } from '../../lib/change-history.js';
import { objectSchema } from '../../lib/tools/shared.js';
import { checkJavaScript } from '../../lib/javascript-tools.js';

export function createEditFilesTool({ changes, workspace, approve = async () => false, settings = () => ({ javascript: {} }) }) {
  return {
    name: 'edit_files', mutatesWorkspace: true,
    description: 'Apply an all-preflighted batch of exact, unique text replacements or file creations. Set old_text to an empty string only to create a missing or empty file; existing nonempty files require a unique match. Every edit must include path. Returns a durable change_id for review/undo/redo. Re-read ambiguous or stale files before retrying.',
    parameters: objectSchema({ edits: { type: 'array', items: objectSchema({ path: { type: 'string', minLength: 1, description: 'Required file path inside the workspace, preferably relative (for example public/index.html).' }, old_text: { type: 'string', description: 'Unique exact text to replace. Empty string creates a missing or empty file only.' }, new_text: { type: 'string', description: 'Replacement text, or the full contents when old_text is empty.' }, expected_hash: { type: ['string', 'null'], description: 'Full-file SHA-256 from read_file, or null.' } }) } }),
    async execute({ edits } = {}, options = {}) {
      validateFileEdits(edits);
      for (const edit of edits || []) if (!await approve(`edit ${edit.path}`)) throw new Error("User denied file edit.");
      const result = await changes.apply(edits, { ...options, label: 'Exact edits' });
      if (settings().javascript.checkAfterEdit) result.diagnostics = await Promise.all(result.paths.map(async (path) => {
        try { return await checkJavaScript(workspace, path, options); } catch (error) { return { ok: false, path, error: error.message }; }
      }));
      return result;
    },
  };
}

export { createEditFilesTool as createTool };
