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

test('list_files treats an empty path as the workspace root and authorizes that path', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-list-root-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, 'sample.txt'), 'sample');
  const targets = [];
  const tools = Object.fromEntries(createTools({ root, authorize: async (name, target) => { targets.push([name, target]); } }).map((tool) => [tool.name, tool]));
  const result = await tools.list_files.execute({ path: '' });
  assert.equal(result.ok, true);
  assert.ok(result.entries.includes('file\tsample.txt'));
  assert.deepEqual(targets, [['list_files', '.']]);
  await assert.rejects(tools.read_file.execute({ path: '' }), /workspace-relative path is required/);
});

test('write_file creates index.html for a full HTML document without a path', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-html-entry-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const targets = [];
  const tools = Object.fromEntries(createTools({ root, approve: async () => true, authorize: async (name, target) => { targets.push([name, target]); } }).map((tool) => [tool.name, tool]));
  const html = '<!DOCTYPE html>\n<html lang="en"><title>Example</title></html>';
  const result = await tools.write_file.execute({ content: html });
  assert.equal(result.path, 'index.html');
  assert.equal(await fs.readFile(path.join(root, 'index.html'), 'utf8'), html);
  assert.deepEqual(targets[0], ['write_file', 'index.html']);
  await assert.rejects(tools.write_file.execute({ content: '<!DOCTYPE html><html>replacement</html>' }), /index.html already exists/);
  assert.equal(await fs.readFile(path.join(root, 'index.html'), 'utf8'), html);
  await assert.rejects(tools.write_file.execute({ content: 'plain text' }), /file path is required/i);
});

test('write_file uses the stylesheet linked from public/index.html when CSS omits its path', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-css-entry-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'public'));
  await fs.writeFile(path.join(root, 'public/index.html'), '<!DOCTYPE html><link rel="stylesheet" href="/styles.css">');
  const targets = [];
  const tools = Object.fromEntries(createTools({ root, approve: async () => true, authorize: async (name, target) => { targets.push([name, target]); } }).map((tool) => [tool.name, tool]));
  const css = '/* Guardian Lock & Key — styles.css */\n:root { --color: red; }';
  const result = await tools.write_file.execute({ content: css });
  assert.equal(result.path, 'public/styles.css');
  assert.equal(await fs.readFile(path.join(root, 'public/styles.css'), 'utf8'), css);
  assert.deepEqual(targets[0], ['write_file', 'public/styles.css']);
  await assert.rejects(tools.write_file.execute({ content: css }), /public\/styles.css already exists/);
  assert.equal(await fs.readFile(path.join(root, 'public/styles.css'), 'utf8'), css);
});
