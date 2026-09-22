import { objectSchema } from '../../lib/tools/shared.js';

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

export { createChangeHistoryTool as createTool };
