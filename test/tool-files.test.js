import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createToolFileStore, toolsRootForDatabase } from '../lib/tool-files.js';
import { createTools } from '../lib/tools/index.js';

test('tool manifests seed builtins and command tools execute with input as an argument', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-tools-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const files = createToolFileStore(toolsRootForDatabase(path.join(root, 'db', 'ui-state.sqlite')));
  assert.ok(files.list().some((tool) => tool.name === 'list_files' && tool.kind === 'builtin'));
  const content = JSON.stringify({ name: 'echo_input', kind: 'command', title: 'Echo input', description: 'Print the input.', group: 'custom', command: process.execPath, args: ['-e', 'process.stdout.write(process.argv[1])', '{{input}}'] });
  assert.equal(files.test(content).valid, true);
  files.write(content, { create: true });
  const store = { getTools: () => files.list() };
  const tool = createTools({ root, store }).find((item) => item.name === 'echo_input');
  assert.equal((await tool.execute({ input: 'hello; $(false)' })).stdout, 'hello; $(false)');
  assert.throws(() => files.write(content, { create: true }), /already exists/);
});

test('a new module tool is discovered from its folder without registry changes', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-module-tool-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const files = createToolFileStore(path.join(root, 'tools'));
  files.write(JSON.stringify({ name: 'hello_world', kind: 'module', title: 'Hello world', description: 'Greet a person.', group: 'custom', entry: 'index.js' }), { create: true });
  fs.writeFileSync(path.join(root, 'tools', 'hello-world', 'index.js'), 'export function createTool() { return { name: "hello_world", description: "Greet a person.", parameters: { type: "object", properties: {}, required: [] }, execute: async () => ({ greeting: "hello" }) }; }\n');
  const store = { getTools: () => files.list(), getToolRoot: () => files.root };
  const tool = createTools({ root, store }).find((item) => item.name === 'hello_world');
  assert.deepEqual(await tool.execute({}), { greeting: 'hello' });
  assert.match(files.readResource('hello_world', 'index.js'), /createTool/);
  assert.equal(files.test(JSON.stringify(files.read('hello_world')), files.readResource('hello_world', 'index.js')).valid, true);
  assert.throws(() => files.test(JSON.stringify(files.read('hello_world')), 'export function createTool( {'), /SyntaxError|Unexpected|missing/i);
  assert.throws(() => files.readResource('hello_world', '../secret'), /Invalid tool resource/);
});

test('a complete tool folder imports with its module and supporting files', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-import-tool-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const files = createToolFileStore(path.join(root, 'tools'));
  const manifest = { name: 'sample_tool', kind: 'module', title: 'Sample tool', description: 'Example.', group: 'custom', entry: 'index.js' };
  files.importFiles([
    { path: 'TOOL.json', content: JSON.stringify(manifest) },
    { path: 'index.js', content: 'export const createTool = () => ({ name: "sample_tool", parameters: { type: "object" }, execute: () => "ok" });' },
    { path: 'examples/example.txt', content: 'example' },
  ]);
  assert.equal(files.readResource('sample_tool', 'examples/example.txt'), 'example');
  assert.ok(files.list().some((tool) => tool.name === 'sample_tool'));
});
