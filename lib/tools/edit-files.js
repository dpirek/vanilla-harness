import { objectSchema } from './shared.js';
import { checkJavaScript } from '../javascript-tools.js';

export function createEditFilesTool({ changes, workspace, approve = async () => false, settings = () => ({ javascript: {} }) }) {
  return {
    name: 'edit_files', mutatesWorkspace: true,
    description: 'Apply an all-preflighted batch of exact, unique text replacements. Returns a durable change_id for review/undo/redo. Re-read ambiguous or stale files before retrying.',
    parameters: objectSchema({ edits: { type: 'array', items: objectSchema({ path: { type: 'string' }, old_text: { type: 'string' }, new_text: { type: 'string' }, expected_hash: { type: ['string', 'null'], description: 'Full-file SHA-256 from read_file, or null.' } }) } }),
    async execute({ edits }, options = {}) {
      for (const edit of edits || []) if (!await approve(`edit ${edit.path}`)) throw new Error("User denied file edit.");
      const result = await changes.apply(edits, { ...options, label: 'Exact edits' });
      if (settings().javascript.checkAfterEdit) result.diagnostics = await Promise.all(result.paths.map(async (path) => {
        try { return await checkJavaScript(workspace, path, options); } catch (error) { return { ok: false, path, error: error.message }; }
      }));
      return result;
    },
  };
}

export function createChangeHistoryTool({ changes }) {
  return {
    name: 'change_history',
    description: 'List recent built-in file changes, inspect before/after text, or undo/redo by change ID. Recovery refuses files changed since the recorded edit. Shell/MCP changes are not tracked.',
    parameters: objectSchema({ action: { type: 'string', enum: ['list', 'inspect', 'undo', 'redo'] }, change_id: { type: ['string', 'null'] } }),
    async execute({ action, change_id: id }, options = {}) {
      if (action === 'list') return { ok: true, changes: changes.list() };
      if (action === 'inspect') return { ok: true, change: await changes.inspect(id, options) };
      return changes.restore(id, action, options);
    },
  };
}
