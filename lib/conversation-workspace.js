import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const SESSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const WORKSPACE_NAME_PATTERN = /^[a-z0-9]{5}$/;
const WORKSPACE_NAME_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const OWNERSHIP_FILE = ".ai-harness-conversation";

function normalizeSessionId(sessionId) {
  const id = String(sessionId || "").trim();
  if (!SESSION_ID_PATTERN.test(id)) throw new Error("Invalid conversation ID.");
  return id;
}

function normalizeWorkspaceName(name) {
  const value = String(name || "").trim();
  if (!WORKSPACE_NAME_PATTERN.test(value)) {
    throw new Error("Conversation workspace names must contain exactly five lowercase letters or numbers.");
  }
  return value;
}

function randomWorkspaceName() {
  return [...crypto.randomBytes(5)]
    .map((value) => WORKSPACE_NAME_ALPHABET[value % WORKSPACE_NAME_ALPHABET.length])
    .join("");
}

function legacyWorkspaceName(sessionId) {
  return `conversation-${normalizeSessionId(sessionId)}`;
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

async function assertDirectory(folder, name) {
  const stat = await fs.lstat(folder);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`Conversation workspace is not a directory: ${name}`);
  }
}

async function writeOwnership(folder, sessionId) {
  await fs.writeFile(path.join(folder, OWNERSHIP_FILE), sessionId, { encoding: "utf8", flag: "wx" });
}

async function assertOwnership(folder, sessionId, name) {
  let owner;
  try {
    owner = (await fs.readFile(path.join(folder, OWNERSHIP_FILE), "utf8")).trim();
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(`Refusing to manage unowned folder: ${name}`);
    }
    throw error;
  }
  if (owner !== sessionId) throw new Error(`Conversation workspace belongs to another conversation: ${name}`);
}

async function findOwnedWorkspace(root, sessionId) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || !WORKSPACE_NAME_PATTERN.test(entry.name)) continue;
    const folder = path.join(root, entry.name);
    try {
      await assertOwnership(folder, sessionId, entry.name);
      return { root, name: entry.name, path: folder };
    } catch {
      // A short user folder or another conversation's workspace is not a match.
    }
  }
  return null;
}

async function createNamedWorkspace(root, sessionId, requestedName) {
  const name = normalizeWorkspaceName(requestedName);
  const folder = path.join(root, name);
  try {
    await fs.mkdir(folder);
    try {
      await writeOwnership(folder, sessionId);
    } catch (error) {
      await fs.rm(folder, { recursive: true, force: true });
      throw error;
    }
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    await assertDirectory(folder, name);
    await assertOwnership(folder, sessionId, name);
  }
  return { root, name, path: folder };
}

async function createConversationWorkspace(requestedRoot, sessionId, requestedName = "") {
  const root = await resolveWorkspaceRoot(requestedRoot);
  const id = normalizeSessionId(sessionId);
  if (requestedName) return createNamedWorkspace(root, id, requestedName);

  const owned = await findOwnedWorkspace(root, id);
  if (owned) return owned;

  const legacyName = legacyWorkspaceName(id);
  const legacyFolder = path.join(root, legacyName);
  let migrateLegacy = false;
  try {
    await assertDirectory(legacyFolder, legacyName);
    migrateLegacy = true;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const name = randomWorkspaceName();
    const folder = path.join(root, name);
    try {
      if (migrateLegacy) {
        await fs.cp(legacyFolder, folder, { recursive: true, force: false, errorOnExist: true });
      }
      else await fs.mkdir(folder);
    } catch (error) {
      if (error.code === "EEXIST") continue;
      throw error;
    }
    try {
      await writeOwnership(folder, id);
    } catch (error) {
      await fs.rm(folder, { recursive: true, force: true });
      throw error;
    }
    if (migrateLegacy) {
      try {
        await fs.rm(legacyFolder, { recursive: true });
      } catch (error) {
        await fs.rm(folder, { recursive: true, force: true });
        throw error;
      }
    }
    return { root, name, path: folder, migrated: migrateLegacy };
  }
  throw new Error("Unable to allocate a unique conversation workspace name.");
}

async function deleteConversationWorkspace(requestedRoot, sessionId, requestedName = "") {
  const root = await resolveWorkspaceRoot(requestedRoot);
  const id = normalizeSessionId(sessionId);
  const name = requestedName ? normalizeWorkspaceName(requestedName) : legacyWorkspaceName(id);
  const folder = path.join(root, name);
  try {
    await assertDirectory(folder, name);
    if (requestedName) await assertOwnership(folder, id, name);
  } catch (error) {
    if (error.code === "ENOENT") return { root, name, path: folder, deleted: false };
    throw error;
  }
  await fs.rm(folder, { recursive: true });
  return { root, name, path: folder, deleted: true };
}

export {
  createConversationWorkspace,
  deleteConversationWorkspace,
};
