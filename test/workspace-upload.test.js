import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { normalizeWorkspaceUploadName, saveWorkspaceUpload } from "../lib/workspace-upload.js";

test("workspace uploads save binary files and atomically replace existing files", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ai-harness-upload-"));
  try {
    await fs.writeFile(path.join(root, "image.bin"), "old");
    const result = await saveWorkspaceUpload(root, "image.bin", Buffer.from([0, 1, 2, 255]));
    assert.deepEqual(await fs.readFile(path.join(root, "image.bin")), Buffer.from([0, 1, 2, 255]));
    assert.equal(result.relativePath, "image.bin");
    assert.equal(result.size, 4);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("workspace upload names cannot escape the selected workspace", () => {
  for (const name of ["../secret", "folder/file.txt", "folder\\file.txt", "..", "\0bad"]) {
    assert.throws(() => normalizeWorkspaceUploadName(name), /File name/);
  }
  assert.equal(normalizeWorkspaceUploadName("report.md"), "report.md");
});
