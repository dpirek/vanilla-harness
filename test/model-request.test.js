import test from 'node:test';
import assert from 'node:assert/strict';
import { withModelRetries } from '../lib/model-request.js';

test('transient pre-output errors retry with the same request, but partial output never retries', async () => {
  let calls = 0;
  const body = { model: 'test', input: [] };
  const client = withModelRetries({ async createResponse(request) { assert.equal(request, body); if (++calls < 3) throw new Error('API error (HTTP 503): busy'); return { output_text: 'ok' }; } }, { delayMs: 0 });
  assert.equal((await client.createResponse(body)).output_text, 'ok'); assert.equal(calls, 3);
  calls = 0;
  const partial = withModelRetries({ async createResponse(_body, options) { calls++; options.onTextDelta('partial'); throw new Error('HTTP 503'); } }, { delayMs: 0 });
  await assert.rejects(partial.createResponse(body, { onTextDelta() {} }), /503/); assert.equal(calls, 1);
});
test('abort cancels provider retry backoff', async () => {
  const controller = new AbortController();
  const client = withModelRetries({ async createResponse() { controller.abort(); throw new Error('HTTP 429'); } });
  await assert.rejects(client.createResponse({}, { signal: controller.signal }), { name: 'AbortError' });
});
