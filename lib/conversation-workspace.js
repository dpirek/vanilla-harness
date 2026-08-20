import fs from "node:fs/promises";
import path from "node:path";

const SESSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

function conversationWorkspaceName(sessionId) {
  const id = String(sessionId || "").trim();
  if (!SESSION_ID_PATTERN.test(id)) throw new Error("Invalid conversation ID.");
  return `conversation-${id}`;
}

async function resolveWorkspaceRoot(requestedRoot) {
  if (typeof requestedRoot !== "string" || !requestedRoot.trim()) {
    throw new Error("Default workspace is required.");
  }
  const root = await fs.realpath(path.resolve(requestedRoot.trim()));
  const stat = await fs.stat(root);
  if (!stat.isDirectory()) throw new Error("Default workspace is not a directory.");
  return root;
}

async function createConversationWorkspace(requestedRoot, sessionId) {
  const root = await resolveWorkspaceRoot(requestedRoot);
  const name = conversationWorkspaceName(sessionId);
  const folder = path.join(root, name);
  try {
    await fs.mkdir(folder);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    const stat = await fs.lstat(folder);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new Error(`Conversation workspace already exists and is not a directory: ${name}`);
    }
  }
  return { root, name, path: folder };
}

async function deleteConversationWorkspace(requestedRoot, sessionId) {
  const root = await resolveWorkspaceRoot(requestedRoot);
  const name = conversationWorkspaceName(sessionId);
  const folder = path.join(root, name);
  try {
    const stat = await fs.lstat(folder);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new Error(`Refusing to delete a non-directory conversation workspace: ${name}`);
    }
  } catch (error) {
    if (error.code === "ENOENT") return { root, name, path: folder, deleted: false };
    throw error;
  }
  await fs.rm(folder, { recursive: true });
  return { root, name, path: folder, deleted: true };
}

export {
  conversationWorkspaceName,
  createConversationWorkspace,
  deleteConversationWorkspace,
};
