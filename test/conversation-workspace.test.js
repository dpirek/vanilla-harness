import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  conversationWorkspaceName,
  createConversationWorkspace,
  deleteConversationWorkspace,
} from "../lib/conversation-workspace.js";

test("conversation workspaces are stable subfolders of the default workspace", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ai-harness-conversations-"));
  try {
    const created = await createConversationWorkspace(root, "session-123");
    assert.equal(created.root, await fs.realpath(root));
    assert.equal(created.name, "conversation-session-123");
    assert.equal(created.path, path.join(await fs.realpath(root), created.name));
    assert.equal((await fs.stat(created.path)).isDirectory(), true);

    const repeated = await createConversationWorkspace(root, "session-123");
    assert.deepEqual(repeated, created);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("deleting a conversation recursively removes its managed workspace", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ai-harness-conversations-"));
  try {
    const created = await createConversationWorkspace(root, "session-delete");
    await fs.mkdir(path.join(created.path, "nested"));
    await fs.writeFile(path.join(created.path, "nested", "result.txt"), "result");

    const removed = await deleteConversationWorkspace(root, "session-delete");
    assert.equal(removed.deleted, true);
    await assert.rejects(fs.access(created.path), { code: "ENOENT" });
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("conversation workspace names reject path traversal", () => {
  assert.throws(() => conversationWorkspaceName("../outside"), /Invalid conversation ID/);
  assert.throws(() => conversationWorkspaceName("session/child"), /Invalid conversation ID/);
});
