import fs from "node:fs/promises";
import path from "node:path";

import {
  createConversationWorkspace,
  deleteConversationWorkspace,
} from "../lib/conversation-workspace.js";
import { createWorkspaceTree } from "../lib/workspace-tree.js";
import { MAX_WORKSPACE_UPLOAD_BYTES, saveWorkspaceUpload } from "../lib/workspace-upload.js";
import { json, methodNotAllowed, readRequestBody, readRequestBuffer } from "./http.js";

const ASSET_CONTENT_TYPES = {
  ".avif": "image/avif",
  ".bmp": "image/bmp",
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".webp": "image/webp",
};

export function createWorkspaceApiHandlers({ uiStateStore, resolveWorkspace }) {
  async function resolveWorkspaceFile(workspace, requestedPath) {
    const root = await resolveWorkspace(workspace);
    if (typeof requestedPath !== "string" || !requestedPath.trim()) throw new Error("Select a file.");
    const candidate = path.resolve(root, requestedPath.trim());
    const realFile = await fs.realpath(candidate);
    const relative = path.relative(root, realFile);
    if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("File is outside the selected workspace.");
    const stat = await fs.stat(realFile);
    if (!stat.isFile()) throw new Error("Selected path is not a file.");
    return { root, file: realFile, stat };
  }

  async function handleWorkspaceTreeApi(req, res, url) {
    if (req.method !== "GET") {
      methodNotAllowed(res, "GET");
      return;
    }
    try {
      const root = await resolveWorkspace(url.searchParams.get("workspace"));
      json(res, 200, { ok: true, root, parent: path.dirname(root), tree: await createWorkspaceTree(root) });
    } catch (error) {
      json(res, 400, { ok: false, error: error.message });
    }
  }

  async function handleWorkspaceFolderApi(req, res) {
    if (req.method !== "POST") {
      methodNotAllowed(res, "POST");
      return;
    }
    try {
      const body = JSON.parse(await readRequestBody(req, 10_000) || "{}");
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!name) throw new Error("Folder name is required.");
      if (Buffer.byteLength(name) > 255) throw new Error("Folder name is too long.");
      if (name === "." || name === ".." || name.includes("/") || name.includes("\\") || name.includes("\0")) {
        throw new Error("Enter a single folder name without path separators.");
      }
      const parent = await resolveWorkspace(body.parent);
      const folder = path.join(parent, name);
      try {
        await fs.mkdir(folder);
      } catch (error) {
        if (error.code === "EEXIST") throw new Error(`A file or folder named "${name}" already exists.`);
        throw error;
      }
      json(res, 201, { ok: true, path: await fs.realpath(folder) });
    } catch (error) {
      json(res, 400, { ok: false, error: error.message });
    }
  }

  async function handleWorkspaceUploadApi(req, res, url) {
    if (req.method !== "POST") {
      methodNotAllowed(res, "POST");
      return;
    }
    try {
      const declaredSize = Number(req.headers["content-length"]);
      if (Number.isFinite(declaredSize) && declaredSize > MAX_WORKSPACE_UPLOAD_BYTES) {
        throw new Error("File is too large to upload (100 MB maximum).");
      }
      const root = await resolveWorkspace(url.searchParams.get("workspace"));
      const content = await readRequestBuffer(req, MAX_WORKSPACE_UPLOAD_BYTES);
      const uploaded = await saveWorkspaceUpload(root, url.searchParams.get("name"), content);
      json(res, 201, { ok: true, ...uploaded });
    } catch (error) {
      json(res, 400, { ok: false, error: error.message });
    }
  }

  async function handleConversationWorkspaceApi(req, res) {
    if (req.method !== "POST" && req.method !== "DELETE") {
      methodNotAllowed(res, "POST, DELETE");
      return;
    }
    try {
      const body = JSON.parse(await readRequestBody(req, 10_000) || "{}");
      const result = req.method === "POST"
        ? await createConversationWorkspace(body.root, body.sessionId, body.name)
        : await deleteConversationWorkspace(body.root, body.sessionId, body.name);
      json(res, req.method === "POST" ? 201 : 200, { ok: true, ...result });
    } catch (error) {
      json(res, 400, { ok: false, error: error.message });
    }
  }

  async function handleWorkspaceFileApi(req, res, url) {
    try {
      if (req.method === "GET") {
        const { file, stat } = await resolveWorkspaceFile(
          url.searchParams.get("workspace"),
          url.searchParams.get("path"),
        );
        if (stat.size > 2_000_000) throw new Error("File is too large to edit (2 MB maximum).");
        const content = await fs.readFile(file, "utf8");
        if (content.includes("\0")) throw new Error("Binary files cannot be edited here.");
        json(res, 200, { ok: true, path: file, content });
        return;
      }
      if (req.method === "PUT") {
        const body = JSON.parse(await readRequestBody(req, 2_100_000) || "{}");
        if (typeof body.content !== "string") throw new Error("Expected file content.");
        if (Buffer.byteLength(body.content) > 2_000_000) throw new Error("File is too large to save (2 MB maximum).");
        const { file } = await resolveWorkspaceFile(body.workspace, body.path);
        await fs.writeFile(file, body.content, "utf8");
        json(res, 200, { ok: true, path: file });
        return;
      }
      methodNotAllowed(res, "GET, PUT");
    } catch (error) {
      json(res, 400, { ok: false, error: error.message });
    }
  }

  async function handleWorkspaceFileAssetApi(req, res, url) {
    if (req.method !== "GET") {
      methodNotAllowed(res, "GET");
      return;
    }
    try {
      const { file, stat } = await resolveWorkspaceFile(
        url.searchParams.get("workspace"),
        url.searchParams.get("path"),
      );
      const extension = path.extname(file).toLowerCase();
      const contentType = ASSET_CONTENT_TYPES[extension] || "application/octet-stream";
      res.writeHead(200, {
        "content-type": contentType,
        "content-length": stat.size,
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      });
      res.end(await fs.readFile(file));
    } catch (error) {
      json(res, 400, { ok: false, error: error.message });
    }
  }

  async function handleWorkspaceRecordingApi(req, res) {
    if (req.method !== "POST") {
      methodNotAllowed(res, "POST");
      return;
    }
    try {
      const body = JSON.parse(await readRequestBody(req, 34_000_000) || "{}");
      const formats = new Map([
        ["audio/webm", "webm"],
        ["audio/ogg", "ogg"],
        ["audio/mp4", "m4a"],
      ]);
      const normalizedMimeType = typeof body.mimeType === "string"
        ? body.mimeType.toLowerCase().split(";", 1)[0].trim()
        : "";
      const extension = formats.get(normalizedMimeType);
      if (!extension || typeof body.data !== "string") throw new Error("Unsupported microphone recording format.");
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(body.data)) throw new Error("Invalid recording data.");
      const recording = Buffer.from(body.data, "base64");
      if (!recording.length) throw new Error("The microphone recording is empty.");
      if (recording.length > 24_000_000) throw new Error("Recording is too large (24 MB maximum).");
      const root = await resolveWorkspace(body.workspace);
      const directory = path.join(root, "recordings");
      await fs.mkdir(directory, { recursive: true });
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const file = path.join(directory, `microphone-${timestamp}.${extension}`);
      await fs.writeFile(file, recording);
      json(res, 200, { ok: true, path: file, relativePath: path.relative(root, file), size: recording.length });
    } catch (error) {
      json(res, 400, { ok: false, error: error.message });
    }
  }

  async function handleWorkspaceTranscriptionApi(req, res) {
    if (req.method !== "POST") {
      methodNotAllowed(res, "POST");
      return;
    }
    try {
      const body = JSON.parse(await readRequestBody(req, 100_000) || "{}");
      const { file, stat } = await resolveWorkspaceFile(body.workspace, body.path);
      const supportedExtensions = new Set([".webm", ".ogg", ".mp4", ".m4a", ".wav", ".mp3", ".mpeg", ".mpga", ".flac"]);
      if (!supportedExtensions.has(path.extname(file).toLowerCase())) throw new Error("Unsupported transcription audio format.");
      if (stat.size > 24_000_000) throw new Error("Recording is too large to transcribe (24 MB maximum).");
      const storedSettings = uiStateStore.getAll().providerSettings || {};
      const apiKey = process.env.OPENAI_API_KEY || storedSettings.apiKey;
      if (!apiKey) throw new Error("Configure an OpenAI API key before using microphone transcription.");

      const form = new FormData();
      form.append("model", "whisper-1");
      form.append("file", new Blob([await fs.readFile(file)]), path.basename(file));
      const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}` },
        body: form,
        signal: AbortSignal.timeout(120_000),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error?.message || `OpenAI transcription failed (${response.status}).`);
      const text = typeof payload.text === "string" ? payload.text.trim() : "";
      if (!text) throw new Error("OpenAI returned an empty transcription.");
      json(res, 200, { ok: true, text, model: "whisper-1" });
    } catch (error) {
      json(res, 400, { ok: false, error: error.message });
    }
  }

  return {
    "/api/workspace-tree": handleWorkspaceTreeApi,
    "/api/workspace-folder": handleWorkspaceFolderApi,
    "/api/workspace-upload": handleWorkspaceUploadApi,
    "/api/conversation-workspace": handleConversationWorkspaceApi,
    "/api/workspace-file": handleWorkspaceFileApi,
    "/api/workspace-file-asset": handleWorkspaceFileAssetApi,
    "/api/workspace-recording": handleWorkspaceRecordingApi,
    "/api/workspace-transcription": handleWorkspaceTranscriptionApi,
  };
}
