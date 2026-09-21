import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRuntimeApiHandlers } from '../api/runtime.js';
import { createUiStateStore } from '../lib/ui-state.js';
import { createChangeHistory } from '../lib/change-history.js';

async function request(handler, method, body) {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
  req.method = method;
  let status; let result;
  await handler(req, { writeHead(code) { status = code; }, end(text) { result = text ? JSON.parse(text) : null; } }, new URL('http://localhost/'));
  return { status, result };
}
test('runtime API persists parsed JSON, validates settings, and executes recovery', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-runtime-api-'));
  const store = createUiStateStore(path.join(root, 'state.sqlite'));
  t.after(async () => { store.close(); await fs.rm(root, { recursive: true, force: true }); });
  const handlers = createRuntimeApiHandlers({ uiStateStore: store, resolveWorkspace: async (workspace) => { assert.equal(workspace, root); return root; } });
  const saved = await request(handlers['/api/runtime-settings'], 'PUT', { context: { maxTokens: 16000 } });
  assert.equal(saved.status, 200); assert.equal(saved.result.settings.context.maxTokens, 16000);
  const loaded = await request(handlers['/api/runtime-settings'], 'GET');
  assert.equal(loaded.result.settings.context.maxTokens, 16000);
  assert.equal((await request(handlers['/api/runtime-settings'], 'PUT', 'not an object')).status, 400);
  assert.equal((await request(handlers['/api/runtime-settings'], 'PUT', { context: { maxTokens: 5 } })).status, 400);
  const change = await createChangeHistory({ root, store }).apply([{ path: 'a.js', content: 'const x = 1;' }]);
  assert.equal((await request(handlers['/api/changes'], 'POST', { workspace: root, id: change.change_id, action: 'undo' })).status, 200);
  await assert.rejects(fs.stat(path.join(root, 'a.js')), { code: 'ENOENT' });
  assert.equal((await request(handlers['/api/changes'], 'POST', { workspace: root, id: change.change_id, action: 'redo' })).status, 200);
  assert.equal(await fs.readFile(path.join(root, 'a.js'), 'utf8'), 'const x = 1;');
});
