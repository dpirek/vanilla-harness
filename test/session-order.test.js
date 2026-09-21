import test from 'node:test';
import assert from 'node:assert/strict';
import { activityMessageIndices, sessionActivityRuns } from '../public/lib/session-activity.js';

const user = (text, images = []) => ({ role: 'user', text, images });
const run = (inputPrompt, messageIndex) => ({ runContext: { inputPrompt, messageIndex } });

test('runs follow their prompts even when both assistant responses are absent', () => {
  assert.deepEqual(activityMessageIndices([user('create a site'), user('style it')], [run('create a site'), run('style it')]), [0, 1]);
});
test('missing and multiple assistant messages do not shift runs', () => {
  assert.deepEqual(activityMessageIndices([user('first'), { role: 'agent', text: 'answer' }, { role: 'agent', text: 'extra' }, user('second'), user('third')], [run('first'), run('second')]), [0, 3]);
});
test('saved prompt indices distinguish repeated prompts and a newly submitted prompt', () => {
  const activities = sessionActivityRuns([
    { title: 'Prompt sent', detail: { runId: 'a', prompt: 'again', messageIndex: 0 }, timestamp: 1 },
    { title: 'Prompt sent', detail: { runId: 'b', prompt: 'again', messageIndex: 1 }, timestamp: 2 },
  ]);
  assert.deepEqual(activityMessageIndices([user('again'), user('again'), user('again')], activities), [0, 1]);
});
test('legacy image prompts and retained recent events map to the appropriate user', () => {
  assert.deepEqual(activityMessageIndices([user('old'), user('picture', [{}]), user('last')], [run('picture (1 image)'), run('last')]), [1, 2]);
  assert.deepEqual(activityMessageIndices([user('old'), user('last')], [{}]), [1]);
  assert.deepEqual(activityMessageIndices([], [{}]), [-1]);
});
