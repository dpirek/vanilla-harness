import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createToolFileStore } from '../lib/tool-files.js';
import { runToolSystemTest } from '../lib/tool-diagnostics.js';

test('tool system test exercises built-ins in an isolated workspace and reports limited integrations', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-system-test-store-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const files = createToolFileStore(path.join(root, 'tools'));
  const report = await runToolSystemTest({ getTools: files.list, getToolRoot: () => files.root });
  const byName = new Map(report.results.map((result) => [result.name, result]));
  for (const name of ['list_files', 'read_file', 'search_files', 'write_file', 'edit_files', 'change_history', 'javascript', 'run_command']) {
    assert.equal(byName.get(name)?.status, 'passed', `${name}: ${byName.get(name)?.detail}`);
  }
  assert.equal(byName.get('delegate_to_sub_agent')?.status, 'limited');
  assert.equal(report.passed + report.failed + report.limited, report.results.length);
  assert.equal(fs.readdirSync(root).join(','), 'tools');
});
