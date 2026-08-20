import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_WORKSPACE_STORAGE_KEY,
  loadDefaultWorkspace,
  saveDefaultWorkspace,
} from "../public/lib/workspace-preferences.js";

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, String(value)); },
  };
}

test("default workspace is empty before the user selects a folder", () => {
  assert.equal(loadDefaultWorkspace(memoryStorage()), "");
});

test("default workspace persists in browser storage", () => {
  const storage = memoryStorage();

  assert.equal(saveDefaultWorkspace(" /tmp/project ", storage), "/tmp/project");
  assert.equal(storage.getItem(DEFAULT_WORKSPACE_STORAGE_KEY), "/tmp/project");
  assert.equal(loadDefaultWorkspace(storage), "/tmp/project");
});

test("an empty workspace cannot be saved as the default", () => {
  assert.throws(() => saveDefaultWorkspace("  ", memoryStorage()), /Choose a workspace folder/);
});
