import assert from "node:assert/strict";
import test from "node:test";

import { createStateSaveQueue } from "../public/lib/state-save-queue.js";

test("state saves coalesce pending history updates into the latest snapshot", async () => {
  const calls = [];
  let releaseFirstSave;
  const firstSave = new Promise((resolve) => { releaseFirstSave = resolve; });
  const persist = createStateSaveQueue(async (state) => {
    calls.push(state);
    if (calls.length === 1) await firstSave;
  });

  const initial = persist({ sessions: [{ messages: [{ role: "user", text: "Hello" }] }] });
  const final = persist({ sessions: [{ messages: [
    { role: "user", text: "Hello" },
    { role: "agent", text: "Final response" },
  ] }] });
  persist({ toolPermissions: { read_file: true } });

  releaseFirstSave();
  await Promise.all([initial, final]);

  assert.equal(calls.length, 2);
  assert.equal(calls[1].sessions[0].messages.at(-1).text, "Final response");
  assert.equal(calls[1].toolPermissions.read_file, true);
});

test("state save failures do not discard a newer pending snapshot", async () => {
  const calls = [];
  const errors = [];
  let releaseFirstSave;
  const firstSave = new Promise((resolve) => { releaseFirstSave = resolve; });
  const persist = createStateSaveQueue(async (state) => {
    calls.push(state);
    if (calls.length === 1) {
      await firstSave;
      throw new Error("temporary failure");
    }
  }, (error) => errors.push(error.message));

  const saving = persist({ sessions: [{ messages: [] }] });
  persist({ sessions: [{ messages: [{ role: "agent", text: "Saved" }] }] });
  releaseFirstSave();
  await saving;

  assert.deepEqual(errors, ["temporary failure"]);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].sessions[0].messages[0].text, "Saved");
});
