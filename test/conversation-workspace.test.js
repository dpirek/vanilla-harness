import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createConversationWorkspace,
  deleteConversationWorkspace,
} from "../lib/conversation-workspace.js";

test("conversation workspaces use stable five-character alphanumeric names", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ai-harness-conversations-"));
  try {
    const created = await createConversationWorkspace(root, "session-123");
    assert.equal(created.root, await fs.realpath(root));
    assert.match(created.name, /^[a-z0-9]{5}$/);
    assert.equal(created.path, path.join(await fs.realpath(root), created.name));
    assert.equal((await fs.stat(created.path)).isDirectory(), true);

    const repeated = await createConversationWorkspace(root, "session-123", created.name);
    assert.deepEqual(repeated, { root: created.root, name: created.name, path: created.path });
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("legacy conversation folders are renamed without losing their files", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ai-harness-conversations-"));
  const legacy = path.join(root, "conversation-session-migrate");
  try {
    await fs.mkdir(path.join(legacy, "nested"), { recursive: true });
    await fs.writeFile(path.join(legacy, "nested", "result.txt"), "preserved");

    const migrated = await createConversationWorkspace(root, "session-migrate");
    assert.match(migrated.name, /^[a-z0-9]{5}$/);
    assert.equal(migrated.migrated, true);
    assert.equal(await fs.readFile(path.join(migrated.path, "nested", "result.txt"), "utf8"), "preserved");
    await assert.rejects(fs.access(legacy), { code: "ENOENT" });
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("deleting a conversation recursively removes its owned workspace", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ai-harness-conversations-"));
  try {
    const created = await createConversationWorkspace(root, "session-delete");
    await fs.mkdir(path.join(created.path, "nested"));
    await fs.writeFile(path.join(created.path, "nested", "result.txt"), "result");

    const removed = await deleteConversationWorkspace(root, "session-delete", created.name);
    assert.equal(removed.deleted, true);
    await assert.rejects(fs.access(created.path), { code: "ENOENT" });
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("short user folders cannot be claimed or deleted as conversation workspaces", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ai-harness-conversations-"));
  const userFolder = path.join(root, "abc12");
  try {
    await fs.mkdir(userFolder);
    await fs.writeFile(path.join(userFolder, "keep.txt"), "keep");
    await assert.rejects(
      createConversationWorkspace(root, "session-safe", "abc12"),
      /Refusing to manage unowned folder/,
    );
    await assert.rejects(
      deleteConversationWorkspace(root, "session-safe", "abc12"),
      /Refusing to manage unowned folder/,
    );
    assert.equal(await fs.readFile(path.join(userFolder, "keep.txt"), "utf8"), "keep");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("conversation workspace names reject non-alphanumeric and wrong-length values", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ai-harness-conversations-"));
  try {
    await assert.rejects(createConversationWorkspace(root, "session-safe", "../x"), /exactly five/);
    await assert.rejects(createConversationWorkspace(root, "session-safe", "abcd"), /exactly five/);
    await assert.rejects(createConversationWorkspace(root, "session/child"), /Invalid conversation ID/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
