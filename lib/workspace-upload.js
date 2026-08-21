import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const MAX_WORKSPACE_UPLOAD_BYTES = 100 * 1024 * 1024;

function normalizeWorkspaceUploadName(value) {
  const name = typeof value === "string" ? value.trim() : "";
  if (!name) throw new Error("File name is required.");
  if (Buffer.byteLength(name) > 255) throw new Error("File name is too long.");
  if (name === "." || name === ".." || name.includes("/") || name.includes("\\") || name.includes("\0")) {
    throw new Error("File name must not contain path separators.");
  }
  return name;
}

async function saveWorkspaceUpload(root, requestedName, content) {
  const name = normalizeWorkspaceUploadName(requestedName);
  if (!Buffer.isBuffer(content)) throw new Error("Expected binary file content.");
  if (content.length > MAX_WORKSPACE_UPLOAD_BYTES) {
    throw new Error("File is too large to upload (100 MB maximum).");
  }

  const target = path.join(root, name);
  const temporary = path.join(root, `.upload-${crypto.randomUUID()}.tmp`);
  await fs.writeFile(temporary, content, { flag: "wx" });
  try {
    await fs.rename(temporary, target);
  } catch (error) {
    await fs.unlink(temporary).catch(() => {});
    if (["EISDIR", "ENOTEMPTY", "EEXIST"].includes(error.code)) {
      throw new Error(`A folder named "${name}" already exists.`);
    }
    throw error;
  }
  return { path: target, relativePath: name, size: content.length };
}

export { MAX_WORKSPACE_UPLOAD_BYTES, normalizeWorkspaceUploadName, saveWorkspaceUpload };
