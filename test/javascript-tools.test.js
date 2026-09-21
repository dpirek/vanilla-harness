import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createTools } from '../lib/tools/index.js';
import { checkJavaScript } from '../lib/javascript-tools.js';

test('Node syntax checks do not execute files and report syntax/import diagnostics', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-js-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, 'valid.mjs'), "import fs from 'node:fs';\nimport missing from './missing.mjs';\nfs.writeFileSync('SHOULD_NOT_EXIST', 'oops');\n");
  const valid = await checkJavaScript(root, 'valid.mjs');
  assert.equal(valid.ok, true);
  assert.ok(valid.diagnostics.some((diagnostic) => diagnostic.message.includes('missing.mjs')));
  await assert.rejects(fs.stat(path.join(root, 'SHOULD_NOT_EXIST')), { code: 'ENOENT' });
  await fs.writeFile(path.join(root, 'invalid.js'), 'const = ;');
  assert.equal((await checkJavaScript(root, 'invalid.js')).ok, false);
});
test('JavaScript tooling indexes declarations/references and excludes strings and comments', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-symbols-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, 'a.js'), '// const ignored = 1;\nconst alpha = 1;\nfunction beta() { return alpha; }\nconst text = "alpha";');
  const tool = createTools({ root }).find((item) => item.name === 'javascript');
  const symbols = await tool.execute({ path: '.', action: 'symbols', query: null });
  assert.deepEqual(symbols.results.map((item) => item.name), ['alpha', 'beta', 'text']);
  const references = await tool.execute({ path: '.', action: 'references', query: 'alpha' });
  assert.deepEqual(references.results.map((item) => item.line), [2, 3]);
});
