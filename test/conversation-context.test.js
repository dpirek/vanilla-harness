import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { ConversationContext } from '../lib/conversation-context.js';
import { createUiStateStore } from '../lib/ui-state.js';
import { CodingAgent } from '../lib/agent.js';
import { createModelClient } from '../lib/openai.js';
import { normalizeRuntimeSettings } from '../lib/runtime-settings.js';

const settings = () => normalizeRuntimeSettings({ context: { maxTokens: 8000, reserveTokens: 1000, keepRecent: 1 } });
const prompt = (text) => ({ role: 'user', content: [{ type: 'input_text', text }] });

test('structured tool history survives restart without response IDs or replayed side effects', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-context-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const filename = path.join(root, 'state.sqlite');
  let store = createUiStateStore(filename);
  let executions = 0; let requests = 0;
  const client = { async createResponse(body) {
    assert.equal(body.previous_response_id, undefined);
    requests++;
    if (requests === 1) return { id: 'r1', output: [{ type: 'function_call', call_id: 'c1', name: 'example', arguments: '{}' }] };
    assert.ok(body.input.some((item) => item.type === 'function_call_output' && item.output.includes('done')));
    return { id: `r${requests}`, output_text: 'Finished' };
  } };
  const make = () => new CodingAgent({ root, model: 'test', client, context: new ConversationContext({ root, store, sessionId: 'one', settings }), tools: [{ name: 'example', parameters: {}, execute: async () => { executions++; return { ok: true, text: 'done' }; } }] });
  await make().run('Do it'); assert.equal(executions, 1);
  store.close(); store = createUiStateStore(filename); t.after(() => store.close());
  await make().run('What happened?'); assert.equal(executions, 1);
});
test('compaction summarizes older complete rounds and keeps recent input intact', async () => {
  const events = [];
  const context = new ConversationContext({ root: '/tmp', sessionId: 'summary', settings, onEvent: (event) => events.push(event) });
  context.seed(Array.from({ length: 9 }, (_, i) => ({ role: i % 2 ? 'agent' : 'user', text: `round ${i}: ${'abc '.repeat(1400)}` })));
  let summaries = 0;
  const input = await context.prepare([prompt('Continue carefully')], { instructions: 'Do work', tools: [], model: 'test', client: { async createResponse(body) { summaries++; assert.equal(body.max_output_tokens, 2000); return { output_text: 'Earlier decisions and unfinished task.' }; } } });
  assert.ok(summaries > 0);
  assert.equal(input.at(-1).content[0].text, 'Continue carefully');
  assert.match(input[0].content[0].text, /Earlier conversation summary/);
  assert.ok(events.some((event) => event.type === 'context_compaction_complete'));
});
test('failed summaries preserve history and oversized recent input fails explicitly', async () => {
  const context = new ConversationContext({ root: '/tmp', sessionId: 'failure', settings });
  context.seed(Array.from({ length: 8 }, () => ({ role: 'user', text: 'a'.repeat(5000) })));
  await assert.rejects(context.prepare([prompt('next')], { instructions: '', tools: [], client: { createResponse: async () => { throw new Error('offline'); } } }), /offline/);
  assert.equal(context.state.rounds.length, 9);
  const huge = new ConversationContext({ root: '/tmp', sessionId: 'huge', settings });
  await assert.rejects(huge.prepare([prompt('x'.repeat(30000))], { instructions: '', tools: [] }), /Context budget exceeded/);
  assert.equal(huge.state.rounds[0][0].content[0].text.length, 30000);
});
test('interrupted tool calls recover as unknown outcomes, never as new executions', async () => {
  const context = new ConversationContext({ root: '/tmp', sessionId: 'interrupted', settings });
  context.state.rounds = [[prompt('modify'), { type: 'function_call', call_id: 'pending', name: 'write_file', arguments: '{}' }]];
  const input = await context.prepare([prompt('resume')], { instructions: '', tools: [] });
  assert.match(input.find((item) => item.type === 'function_call_output').output, /unknown/);
});
for (const provider of ['custom', 'ollama']) test(`${provider} replays assistant text and paired structured calls`, async () => {
  let sent;
  const client = createModelClient({ provider, baseUrl: 'http://example.invalid', fetchImpl: async (_url, options) => {
    sent = JSON.parse(options.body);
    return new Response(JSON.stringify(provider === 'custom' ? { choices: [{ message: { role: 'assistant', content: 'OK' } }] } : { message: { role: 'assistant', content: 'OK' } }));
  } });
  await client.createResponse({ model: 'test', input: [prompt('hi'), { role: 'assistant', content: [{ type: 'output_text', text: 'I will inspect' }] }, { type: 'function_call', name: 'read_file', call_id: 'one', arguments: '{"path":"a.js"}' }, { type: 'function_call_output', call_id: 'one', output: 'file content' }, prompt('continue')] });
  const assistant = sent.messages.find((message) => message.role === 'assistant');
  assert.equal(assistant.content, 'I will inspect');
  assert.equal(assistant.tool_calls[0].function.name, 'read_file');
  assert.ok(sent.messages.some((message) => message.role === 'tool' && message.content === 'file content'));
});
