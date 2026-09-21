import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createAuthorizer, permissionDecision, protectTools } from '../lib/permissions.js';
import { normalizeRuntimeSettings } from '../lib/runtime-settings.js';
import { createTools } from '../lib/tools/index.js';

test('ordered wildcard policies default to allow and later rules override', () => {
  const policy = { default: 'ask', rules: [{ tool: '*', pattern: '*', action: 'deny' }, { tool: 'read_*', pattern: 'src/*', action: 'allow' }] };
  assert.equal(permissionDecision(policy, 'read_file', 'src/a.js'), 'allow');
  assert.equal(permissionDecision(policy, 'write_file', 'src/a.js'), 'deny');
  assert.equal(permissionDecision({ default: 'ask' }, 'run_command', 'node --test'), 'ask');
  assert.throws(() => normalizeRuntimeSettings({ permissions: { default: 'oops', rules: [] } }), /default/);
});
test('ask, deny, and abort gate side effects including custom/MCP tools', async () => {
  let action = 'ask'; let approved = false; let runs = 0;
  const authorize = createAuthorizer({ settings: () => ({ permissions: { default: action, rules: [] } }), ask: async () => approved });
  const [tool] = protectTools([{ name: 'mcp_demo', execute: () => ++runs }], authorize);
  await assert.rejects(tool.execute({}), /denied/); assert.equal(runs, 0);
  approved = true; await tool.execute({}); assert.equal(runs, 1);
  action = 'deny'; await assert.rejects(tool.execute({}), /denied/); assert.equal(runs, 1);
  action = 'allow'; const controller = new AbortController(); controller.abort();
  await assert.rejects(tool.execute({}, { signal: controller.signal }), { name: 'AbortError' }); assert.equal(runs, 1);
});
test('canonical paths and recursive search cannot bypass read deny rules', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-policy-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, '.env'), 'SECRET=value');
  await fs.writeFile(path.join(root, 'public.js'), 'const PUBLIC = 1;');
  const authorize = createAuthorizer({ settings: () => ({ permissions: { default: 'allow', rules: [{ tool: 'read_file', pattern: '.env*', action: 'deny' }] } }) });
  const tools = Object.fromEntries(createTools({ root, authorize }).map((tool) => [tool.name, tool]));
  await assert.rejects(tools.read_file.execute({ path: './foo/../.env' }), /denied/);
  const result = await tools.search_files.execute({ path: '.', query: 'SECRET|PUBLIC' });
  assert.equal(result.matches.length, 1); assert.match(result.matches[0], /PUBLIC/);
});
