import { createTools } from '../lib/tools/index.js';
import { json, methodNotAllowed, readRequestBody } from './http.js';
import { runtimeSettings, normalizeRuntimeSettings } from '../lib/runtime-settings.js';
import { createChangeHistory } from '../lib/change-history.js';
import { createAuthorizer } from '../lib/permissions.js';

export function createRuntimeApiHandlers({ uiStateStore, resolveWorkspace }) {
  return {
    '/api/runtime-settings': async (req, res) => {
      try {
        if (req.method === 'GET') return json(res, 200, { ok: true, settings: runtimeSettings(uiStateStore) });
        if (req.method !== 'PUT') return methodNotAllowed(res, 'GET, PUT');
        const settings = normalizeRuntimeSettings(JSON.parse(await readRequestBody(req)));
        uiStateStore.setRuntimeValue('settings', settings);
        json(res, 200, { ok: true, settings });
      } catch (error) { json(res, 400, { ok: false, error: error.message }); }
    },
    '/api/javascript': async (req, res) => {
      try {
        if (req.method !== 'POST') return methodNotAllowed(res, 'POST');
        const body = JSON.parse(await readRequestBody(req));
        const root = await resolveWorkspace(body.workspace);
        const authorize = createAuthorizer({ settings: () => runtimeSettings(uiStateStore), ask: async () => true });
        const tool = createTools({ root, authorize }).find((item) => item.name === 'javascript');
        json(res, 200, await tool.execute({ path: body.path || '.', action: body.action || 'diagnostics', query: body.query || null }));
      } catch (error) { json(res, 400, { ok: false, error: error.message }); }
    },
    '/api/changes': async (req, res, url) => {
      try {
        if (!['GET', 'POST'].includes(req.method)) return methodNotAllowed(res, 'GET, POST');
        const body = req.method === 'POST' ? JSON.parse(await readRequestBody(req)) : Object.fromEntries(url.searchParams);
        const root = await resolveWorkspace(body.workspace);
        // This endpoint is an explicit human recovery action. Ask rules are
        // satisfied by clicking Undo/Redo; deny rules remain enforced.
        const authorize = createAuthorizer({ settings: () => runtimeSettings(uiStateStore), ask: async () => true });
        await authorize('change_history', body.action || 'list');
        const changes = createChangeHistory({ root, store: uiStateStore, authorize });
        if (req.method === 'GET') return json(res, 200, { ok: true, ...(body.id ? { change: await changes.inspect(body.id) } : { changes: changes.list() }) });
        if (!['undo', 'redo'].includes(body.action)) throw new Error('Choose undo or redo.');
        json(res, 200, await changes.restore(body.id, body.action));
      } catch (error) { json(res, 400, { ok: false, error: error.message }); }
    },
  };
}
