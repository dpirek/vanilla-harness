import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createChangeHistory, fileHash } from '../lib/change-history.js';
import { createUiStateStore } from '../lib/ui-state.js';
import { createTools } from '../lib/tools/index.js';

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-history-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}
test('exact batch editing rejects ambiguous or stale edits before modifying any files', async (t) => {
  const root = await fixture(t);
  await fs.writeFile(path.join(root, 'a.js'), 'const x = 1;');
  await fs.writeFile(path.join(root, 'b.js'), 'x x');
  const history = createChangeHistory({ root });
  await assert.rejects(history.apply([{ path: 'a.js', old_text: '1', new_text: '2' }, { path: 'b.js', old_text: 'x', new_text: 'y' }]), /exactly once/);
  assert.equal(await fs.readFile(path.join(root, 'a.js'), 'utf8'), 'const x = 1;');
  await assert.rejects(history.apply([{ path: 'a.js', old_text: '1', new_text: '2', expected_hash: fileHash('stale') }]), /Stale/);
  assert.equal(history.list().length, 0);
});
test('durable undo and redo survive database reopen and preserve later user changes', async (t) => {
  const root = await fixture(t);
  const db = path.join(root, 'state.sqlite');
  let store = createUiStateStore(db);
  const original = 'const x = 1;\n';
  await fs.writeFile(path.join(root, 'a.js'), original);
  let history = createChangeHistory({ root, store });
  const result = await history.apply([{ path: 'a.js', old_text: '1', new_text: '2' }, { path: 'new.js', content: 'export {};\n' }]);
  store.close(); store = createUiStateStore(db);
  t.after(() => store.close());
  history = createChangeHistory({ root, store });
  assert.equal(history.list()[0].id, result.change_id);
  await fs.writeFile(path.join(root, 'a.js'), 'user change');
  await assert.rejects(history.restore(result.change_id, 'undo'), /Recovery conflict/);
  assert.equal(await fs.readFile(path.join(root, 'new.js'), 'utf8'), 'export {};\n');
  await fs.writeFile(path.join(root, 'a.js'), 'const x = 2;\n');
  await history.restore(result.change_id, 'undo');
  assert.equal(await fs.readFile(path.join(root, 'a.js'), 'utf8'), original);
  await assert.rejects(fs.stat(path.join(root, 'new.js')), { code: 'ENOENT' });
  await history.restore(result.change_id, 'redo');
  assert.equal(await fs.readFile(path.join(root, 'a.js'), 'utf8'), 'const x = 2;\n');
});
test('workspace tools reject traversal and symlinks; writes and exact edits share history', async (t) => {
  const root = await fixture(t);
  await fs.symlink(os.tmpdir(), path.join(root, 'escape'));
  const tools = Object.fromEntries(createTools({ root, approve: async () => true }).map((tool) => [tool.name, tool]));
  await assert.rejects(tools.write_file.execute({ path: '../escape.js', content: 'x' }), /outside/);
  await assert.rejects(tools.read_file.execute({ path: 'escape/a.js' }), /Symbolic/);
  const write = await tools.write_file.execute({ path: 'a.js', content: 'const x = 1;' });
  const read = await tools.read_file.execute({ path: 'a.js' });
  assert.equal(read.hash, fileHash('const x = 1;'));
  await tools.edit_files.execute({ edits: [{ path: 'a.js', old_text: '1', new_text: '2', expected_hash: read.hash }] });
  assert.equal((await tools.change_history.execute({ action: 'list' })).changes.length, 2);
  await assert.rejects(tools.change_history.execute({ action: 'undo', change_id: write.change_id }), /conflict/);
});
test('recovery checks every file permission before any restore', async (t) => {
  const root = await fixture(t);
  let deny = false;
  const history = createChangeHistory({ root, authorize: async (_tool, target) => { if (deny && target === 'b.js') throw new Error('Permission denied'); } });
  const result = await history.apply([{ path: 'a.js', content: 'a' }, { path: 'b.js', content: 'b' }]);
  deny = true;
  await assert.rejects(history.restore(result.change_id, 'undo'), /Permission denied/);
  assert.equal(await fs.readFile(path.join(root, 'a.js'), 'utf8'), 'a');
});

test('prepared crash records recover partially applied batches without replaying writes', async (t) => {
  const root = await fixture(t);
  const store = createUiStateStore(path.join(root, 'state.sqlite'));
  t.after(() => store.close());
  const key = `changes:${path.resolve(root)}`;
  store.setRuntimeValue(key, [{ id: 'crash', state: 'prepared', at: Date.now(), label: 'Interrupted batch', files: [{ path: 'a.js', before: 'before', after: 'after', mode: 0o644 }, { path: 'b.js', before: null, after: 'new', mode: null }] }]);
  await fs.writeFile(path.join(root, 'a.js'), 'after');
  const history = createChangeHistory({ root, store });
  await history.restore('crash', 'undo');
  assert.equal(await fs.readFile(path.join(root, 'a.js'), 'utf8'), 'before');
  await assert.rejects(fs.stat(path.join(root, 'b.js')), { code: 'ENOENT' });
});
