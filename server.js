#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createModelClient } from "./lib/openai.js";
import { CodingAgent, resolveDisabledSteps } from "./lib/agent.js";
import { createTools } from "./lib/tools.js";
import { loadMcpTools } from "./lib/mcp.js";
import { createUiStateStore } from "./lib/ui-state.js";
import { createWorkspaceTree } from "./lib/workspace-tree.js";
import {
  createConversationWorkspace,
  deleteConversationWorkspace,
} from "./lib/conversation-workspace.js";
import {
  normalizeSkillName,
  skillDraft,
  syncSkillContentName,
  validateSkillContent,
} from "./public/lib/skill-content.js";
import {
  defaultBaseUrlForProvider,
  defaultModelForProvider,
  normalizeProvider,
  resolveProviderApiKey,
} from "./lib/provider-config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
const runtimeRoot = path.resolve(process.env.AI_HARNESS_DATA_DIR || process.cwd());
const defaultWorkspace = path.resolve(process.env.AI_HARNESS_WORKSPACE || process.cwd());
const configPath = path.join(runtimeRoot, ".ai-harness/config.toml");
const databaseDir = path.join(runtimeRoot, "db");
const uiStateDatabasePath = path.join(databaseDir, "ui-state.sqlite");
const legacyUiStateDatabasePath = path.join(runtimeRoot, ".ai-harness/ui-state.sqlite");

const defaultPort = Number(process.env.PORT || 3000);
await fs.mkdir(databaseDir, { recursive: true });
let databaseExists = true;

try {
  await fs.access(uiStateDatabasePath);
} catch {
  databaseExists = false;
}

if (!databaseExists) {
  for (const suffix of ["", "-wal", "-shm"]) {
    try {
      await fs.rename(`${legacyUiStateDatabasePath}${suffix}`, `${uiStateDatabasePath}${suffix}`);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
}
const uiStateStore = createUiStateStore(uiStateDatabasePath);

if (uiStateStore.getMcpConfig() === undefined) {
  try {
    uiStateStore.setMcpConfig(await fs.readFile(configPath, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

const CONTENT_TYPES = {
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

const WEBSOCKET_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const MAX_WEBSOCKET_TEXT_BYTES = 40 * 1024 * 1024;
const providerSettings = new Map();
const toolPermissions = new Map();

const DEFAULT_TOOL_PERMISSIONS = {
  list_files: true,
  read_file: true,
  write_file: true,
  search_files: true,
  curl: true,
  run_command: true,
};

function normalizeToolPermissions(value = {}) {
  return Object.fromEntries(
    Object.entries(DEFAULT_TOOL_PERMISSIONS).map(([name, defaultValue]) => [
      name,
      typeof value[name] === "boolean" ? value[name] : defaultValue,
    ]),
  );
}

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

async function readRequestBody(req, limit = 250_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error("Request body is too large.");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function handleConfigApi(req, res) {
  if (req.method === "GET") {
    const content = uiStateStore.getMcpConfig();
    json(res, 200, { ok: true, exists: content !== undefined, path: "db/ui-state.sqlite", content: content || "" });
    return;
  }

  if (req.method === "PUT") {
    try {
      const body = JSON.parse(await readRequestBody(req));
      if (typeof body.content !== "string") {
        json(res, 400, { ok: false, error: "Expected string content." });
        return;
      }
      uiStateStore.setMcpConfig(body.content);
      json(res, 200, {
        ok: true,
        path: "db/ui-state.sqlite",
        bytes: Buffer.byteLength(body.content),
      });
    } catch (error) {
      json(res, 400, { ok: false, error: error.message });
    }
    return;
  }

  res.writeHead(405, { allow: "GET, PUT" });
  res.end();
}

async function handleModelsApi(req, res) {
  if (req.method !== "POST") {
    res.writeHead(405, { allow: "POST" });
    res.end();
    return;
  }

  try {
    const body = JSON.parse(await readRequestBody(req, 20_000) || "{}");
    const provider = normalizeProvider(body.provider);
    const baseUrl = String(body.baseUrl || "").trim();
    const storedSettings = uiStateStore.getAll().providerSettings || {};
    const storedApiKey = storedSettings.provider === provider ? storedSettings.apiKey : "";
    const apiKey = String(body.apiKey || storedApiKey || "").trim();

    if (provider === "ollama") {
      const origin = (baseUrl || process.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/$/, "");
      const response = await fetch(`${origin}/api/tags`);
      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`Ollama returned invalid JSON (HTTP ${response.status}): ${text}`);
      }
      if (!response.ok) throw new Error(`Ollama API error (HTTP ${response.status}): ${data.error || text}`);
      const models = (data.models || [])
        .map((model) => model.model || model.name)
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));
      json(res, 200, { ok: true, provider, models });
      return;
    }

    const origin = (baseUrl || defaultBaseUrlForProvider(provider) || "https://api.openai.com/v1").replace(/\/$/, "");
    const bearer = resolveProviderApiKey(provider, apiKey);
    if (provider === "openai" && !bearer) {
      json(res, 400, { ok: false, error: "Save an OpenAI API key in Provider settings first." });
      return;
    }
    const headers = {};
    if (bearer) headers.authorization = `Bearer ${bearer}`;
    const response = await fetch(`${origin}/models`, {
      headers,
    });
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`${provider === "custom" ? "Custom provider" : "OpenAI"} returned invalid JSON (HTTP ${response.status}): ${text}`);
    }
    if (!response.ok) {
      const message = data.error?.message || JSON.stringify(data);
      throw new Error(`${provider === "custom" ? "Custom provider" : "OpenAI"} API error (HTTP ${response.status}): ${message}`);
    }
    const models = (data.data || [])
      .map((model) => model.id)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
    json(res, 200, { ok: true, provider, models });
  } catch (error) {
    json(res, 400, { ok: false, error: error.message });
  }
}

async function handleUiStateApi(req, res) {
  if (req.method === "GET") {
    json(res, 200, { ok: true, state: uiStateStore.getAll() });
    return;
  }
  if (req.method === "PUT") {
    try {
      const body = JSON.parse(await readRequestBody(req, 50 * 1024 * 1024) || "{}");
      uiStateStore.set(body.state);
      json(res, 200, { ok: true });
    } catch (error) {
      json(res, 400, { ok: false, error: error.message });
    }
    return;
  }
  res.writeHead(405, { allow: "GET, PUT" });
  res.end();
}

async function handleRigConfigurationsApi(req, res) {
  if (req.method === "GET") {
    json(res, 200, { ok: true, ...uiStateStore.getRigConfigurations() });
    return;
  }
  if (req.method === "PUT") {
    try {
      const body = JSON.parse(await readRequestBody(req, 250_000) || "{}");
      const result = uiStateStore.setRigConfigurations(body.configurations, body.activeConfigurationId);
      json(res, 200, { ok: true, ...result });
    } catch (error) {
      json(res, 400, { ok: false, error: error.message });
    }
    return;
  }
  res.writeHead(405, { allow: "GET, PUT" });
  res.end();
}

async function handleSystemPromptsApi(req, res) {
  if (req.method === "GET") {
    json(res, 200, { ok: true, prompts: uiStateStore.getSystemPromptRows() });
    return;
  }
  if (req.method === "PUT") {
    try {
      const body = JSON.parse(await readRequestBody(req, 100_000) || "{}");
      if (typeof body.key !== "string" || typeof body.content !== "string") {
        throw new Error("Expected prompt key and content.");
      }
      uiStateStore.setSystemPrompt(body.key, body.content);
      json(res, 200, { ok: true });
    } catch (error) {
      json(res, 400, { ok: false, error: error.message });
    }
    return;
  }
  res.writeHead(405, { allow: "GET, PUT" }); res.end();
}

async function handleSkillsApi(req, res) {
  if (req.method === "GET") {
    json(res, 200, { ok: true, skills: uiStateStore.getSkills() });
    return;
  }
  if (req.method === "POST") {
    try {
      const body = JSON.parse(await readRequestBody(req, 2_100_000) || "{}");
      if (typeof body.name !== "string") throw new Error("Expected skill name.");
      const name = normalizeSkillName(body.name);
      if (!name) throw new Error("Enter a skill name using letters, numbers, and hyphens.");
      const draft = typeof body.content === "string" && body.content.trim()
        ? body.content
        : skillDraft(name);
      const content = validateSkillContent(syncSkillContentName(draft, name));
      json(res, 200, { ok: true, ...uiStateStore.createSkill({ name, content }) });
    } catch (error) {
      json(res, 400, { ok: false, error: error.message });
    }
    return;
  }
  if (req.method === "PUT") {
    try {
      const body = JSON.parse(await readRequestBody(req, 2_100_000) || "{}");
      if (Array.isArray(body.selectedSkillIds)) {
        json(res, 200, { ok: true, skills: uiStateStore.setSelectedSkills(body.selectedSkillIds) });
        return;
      }
      if (typeof body.skillId === "string" && typeof body.content === "string") {
        const skill = uiStateStore.getSkills().find((entry) => entry.id === body.skillId);
        if (!skill) throw new Error(`Unknown skill: ${body.skillId}`);
        const name = normalizeSkillName(typeof body.name === "string" ? body.name : skill.name);
        if (!name) throw new Error("Enter a skill name using letters, numbers, and hyphens.");
        const content = validateSkillContent(syncSkillContentName(body.content, name));
        json(res, 200, {
          ok: true,
          ...uiStateStore.updateSkill(body.skillId, { name, content }),
        });
        return;
      }
      throw new Error("Expected selected skill ids or skill content.");
    } catch (error) {
      json(res, 400, { ok: false, error: error.message });
    }
    return;
  }
  res.writeHead(405, { allow: "GET, POST, PUT" });
  res.end();
}

async function handleWorkspaceTreeApi(req, res, url) {
  if (req.method !== "GET") { res.writeHead(405, { allow: "GET" }); res.end(); return; }
  try {
    const root = await resolveWorkspace(url.searchParams.get("workspace"));
    json(res, 200, { ok: true, root, parent: path.dirname(root), tree: await createWorkspaceTree(root) });
  } catch (error) {
    json(res, 400, { ok: false, error: error.message });
  }
}

async function handleWorkspaceFolderApi(req, res) {
  if (req.method !== "POST") { res.writeHead(405, { allow: "POST" }); res.end(); return; }
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

async function handleConversationWorkspaceApi(req, res) {
  if (req.method !== "POST" && req.method !== "DELETE") {
    res.writeHead(405, { allow: "POST, DELETE" });
    res.end();
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
    res.writeHead(405, { allow: "GET, PUT" }); res.end();
  } catch (error) {
    json(res, 400, { ok: false, error: error.message });
  }
}

async function handleWorkspaceFileAssetApi(req, res, url) {
  if (req.method !== "GET") {
    res.writeHead(405, { allow: "GET" });
    res.end();
    return;
  }
  try {
    const { file, stat } = await resolveWorkspaceFile(
      url.searchParams.get("workspace"),
      url.searchParams.get("path"),
    );
    const extension = path.extname(file).toLowerCase();
    const contentType = CONTENT_TYPES[extension] || "application/octet-stream";
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
  if (req.method !== "POST") { res.writeHead(405, { allow: "POST" }); res.end(); return; }
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
  if (req.method !== "POST") { res.writeHead(405, { allow: "POST" }); res.end(); return; }
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

function resolvePublicPath(urlPath) {
  const decoded = decodeURIComponent(urlPath);
  const target = decoded === "/" ? "/index.html" : decoded;
  const absolute = path.resolve(publicDir, `.${target}`);
  const relative = path.relative(publicDir, absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return absolute;
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (url.pathname === "/favicon.ico") {
    res.writeHead(302, { location: "/logo.svg" });
    res.end();
    return;
  }
  const filePath = resolvePublicPath(url.pathname);
  if (!filePath) {
    json(res, 403, { ok: false, error: "Path is outside public directory." });
    return;
  }

  try {
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) {
      json(res, 404, { ok: false, error: "Not found." });
      return;
    }
    const contentType = CONTENT_TYPES[path.extname(filePath)] || "application/octet-stream";
    res.writeHead(200, {
      "content-type": contentType,
      "content-length": stat.size,
      "cache-control": "no-store",
    });
    res.end(await fs.readFile(filePath));
  } catch (error) {
    if (error.code === "ENOENT") json(res, 404, { ok: false, error: "Not found." });
    else json(res, 500, { ok: false, error: error.message });
  }
}

function sendFrame(socket, payload) {
  if (socket.destroyed) return;
  const data = Buffer.from(payload);
  let header;
  if (data.length < 126) {
    header = Buffer.from([0x81, data.length]);
  } else if (data.length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(data.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(data.length), 2);
  }
  socket.write(Buffer.concat([header, data]));
}

function sendJson(socket, payload) {
  sendFrame(socket, JSON.stringify(payload));
}

function closeSocket(socket, code = 1000, reason = "") {
  if (socket.destroyed) return;
  const reasonBuffer = Buffer.from(reason);
  const payload = Buffer.alloc(2 + reasonBuffer.length);
  payload.writeUInt16BE(code, 0);
  reasonBuffer.copy(payload, 2);
  socket.write(Buffer.concat([Buffer.from([0x88, payload.length]), payload]));
  socket.end();
}

function decodeFrames(buffer) {
  const messages = [];
  let offset = 0;

  while (offset + 2 <= buffer.length) {
    const first = buffer[offset];
    const second = buffer[offset + 1];
    const fin = (first & 0x80) !== 0;
    const opcode = first & 0x0f;
    const masked = (second & 0x80) !== 0;
    let length = second & 0x7f;
    let cursor = offset + 2;

    if (length === 126) {
      if (cursor + 2 > buffer.length) break;
      length = buffer.readUInt16BE(cursor);
      cursor += 2;
    } else if (length === 127) {
      if (cursor + 8 > buffer.length) break;
      const bigLength = buffer.readBigUInt64BE(cursor);
      if (bigLength > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new Error("WebSocket frame is too large.");
      }
      length = Number(bigLength);
      cursor += 8;
    }

    if (!masked) throw new Error("Client WebSocket frames must be masked.");
    if (cursor + 4 + length > buffer.length) break;

    const mask = buffer.subarray(cursor, cursor + 4);
    cursor += 4;
    const payload = Buffer.alloc(length);
    for (let index = 0; index < length; index += 1) {
      payload[index] = buffer[cursor + index] ^ mask[index % 4];
    }
    cursor += length;
    offset = cursor;

    if (opcode === 0x8) messages.push({ type: "close" });
    else if (opcode === 0x9) messages.push({ type: "ping", payload });
    else if (opcode === 0x1) messages.push({ type: "text", payload, fin });
    else if (opcode === 0x0) messages.push({ type: "continuation", payload, fin });
  }

  return { messages, remaining: buffer.subarray(offset) };
}

function promptWithHistory(prompt, history) {
  if (!Array.isArray(history) || history.length === 0) return prompt;

  const transcript = history
    .filter((message) => (
      (message.role === "user" || message.role === "agent") &&
      typeof message.text === "string" &&
      message.text.trim()
    ))
    .slice(-20)
    .map((message) => {
      const role = message.role === "agent" ? "Assistant" : "User";
      return `${role}: ${message.text.trim().slice(0, 6000)}`;
    })
    .join("\n\n");

  if (!transcript) return prompt;
  return `Continue this conversation using the prior transcript for context.

Prior transcript:
${transcript}

Current user message:
${prompt}`;
}

function requestImages(payload) {
  if (!Array.isArray(payload.images)) return [];
  return payload.images
    .filter((image) => (
      image &&
      typeof image.dataUrl === "string" &&
      image.dataUrl.startsWith("data:image/")
    ))
    .slice(0, 4)
    .map((image) => ({
      name: typeof image.name === "string" ? image.name.slice(0, 200) : "image",
      type: typeof image.type === "string" ? image.type.slice(0, 100) : "image/*",
      dataUrl: image.dataUrl,
    }));
}

async function resolveWorkspace(requested) {
  if (typeof requested !== "string" || !requested.trim()) {
    throw new Error("Select a workspace before sending a prompt.");
  }
  if (requested.length > 4096) throw new Error("Workspace path is too long.");
  const root = path.resolve(defaultWorkspace, requested.trim());
  const stat = await fs.stat(root);
  if (!stat.isDirectory()) throw new Error(`Workspace is not a directory: ${requested}`);
  return fs.realpath(root);
}

async function createAgentSession(socket, sessionId, streamStates, root, disabledSteps = []) {
  const storedSettings = uiStateStore.getAll().providerSettings || {};
  const settings = { ...storedSettings, ...(providerSettings.get(socket) || {}) };
  const provider = normalizeProvider(settings.provider || process.env.AI_PROVIDER);
  const model = settings.model ||
    process.env.AI_MODEL ||
    defaultModelForProvider(provider);
  const approveMcp = async () => true;
  const onInfo = (message) => sendJson(socket, { type: "info", message });
  const onTool = ({ name, args }) => sendJson(socket, { type: "tool", name, args });
  const onEvent = (event) => sendJson(socket, { type: "agent_event", event });
  const onTextDelta = (text) => {
    const state = streamStates.get(sessionId) || { started: false };
    if (!state.started) {
      sendJson(socket, { type: "answer_start", sessionId });
      state.started = true;
      streamStates.set(sessionId, state);
    }
    sendJson(socket, { type: "answer_delta", sessionId, text });
  };

  const apiKey = resolveProviderApiKey(provider, settings.apiKey);
  if (provider === "openai" && !apiKey) {
    throw new Error("Save an OpenAI API key in Provider settings first.");
  }

  const client = createModelClient({
    provider,
    apiKey,
    baseUrl: settings.baseUrl || defaultBaseUrlForProvider(provider),
  });
  const permissions = normalizeToolPermissions(toolPermissions.get(socket));
  // Enabling a built-in tool in the web Tools settings is the user's
  // authorization to execute it. Disabled tools are not exposed to the model.
  const disabled = new Set(disabledSteps);
  const localTools = disabled.has("tools") ? [] : createTools({ root, approve: async () => true })
    .filter((tool) => permissions[tool.name] === true);
  const mcpTools = disabled.has("mcp") ? [] : await loadMcpTools({
      root,
      configContent: uiStateStore.getMcpConfig() || "",
      approve: approveMcp,
      onInfo,
      autoApprove: true,
    });
  return new CodingAgent({
    client,
    tools: [...localTools, ...mcpTools],
    model,
    root,
    approve: approveMcp,
    onInfo,
    onTool,
    onEvent,
    onTextDelta,
    systemPrompts: uiStateStore.getSystemPrompts(),
    skills: uiStateStore.getSelectedSkills(),
    disabledSteps,
  });
}

function createExecutionControl({ onPaused = () => {}, onResumed = () => {} } = {}) {
  let state = "running";
  let waiters = [];
  return {
    get state() {
      return state;
    },
    requestPause() {
      if (state !== "running") return false;
      state = "pause_requested";
      return true;
    },
    resume() {
      if (state === "running") return false;
      state = "running";
      const pending = waiters;
      waiters = [];
      pending.forEach((resolve) => resolve());
      onResumed();
      return true;
    },
    async waitIfPaused() {
      if (state !== "pause_requested" && state !== "paused") return;
      if (state === "pause_requested") {
        state = "paused";
        onPaused();
      }
      await new Promise((resolve) => waiters.push(resolve));
    },
  };
}

function handleWebSocket(socket, req) {
  const key = req.headers["sec-websocket-key"];
  if (!key) {
    socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
    return;
  }

  const accept = crypto
    .createHash("sha1")
    .update(`${key}${WEBSOCKET_GUID}`)
    .digest("base64");
  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
      "Upgrade: websocket\r\n" +
      "Connection: Upgrade\r\n" +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
  );

  let frameBuffer = Buffer.alloc(0);
  let textFragments = [];
  const agentSessions = new Map();
  const streamStates = new Map();
  let running = false;
  let currentRun = null;

  socket.on("data", async (chunk) => {
    try {
      frameBuffer = Buffer.concat([frameBuffer, chunk]);
      const decoded = decodeFrames(frameBuffer);
      frameBuffer = decoded.remaining;

      for (const message of decoded.messages) {
        if (message.type === "close") {
          closeSocket(socket);
          return;
        }
        if (message.type === "ping") {
          socket.write(Buffer.concat([Buffer.from([0x8a, message.payload.length]), message.payload]));
          continue;
        }
        let text;
        if (message.type === "text") {
          if (!message.fin) {
            textFragments = [message.payload];
            continue;
          }
          text = message.payload.toString("utf8");
        } else if (message.type === "continuation") {
          textFragments.push(message.payload);
          const totalBytes = textFragments.reduce((total, fragment) => total + fragment.length, 0);
          if (totalBytes > MAX_WEBSOCKET_TEXT_BYTES) {
            throw new Error("WebSocket message is too large.");
          }
          if (!message.fin) continue;
          text = Buffer.concat(textFragments).toString("utf8");
          textFragments = [];
        } else {
          continue;
        }

        const payload = JSON.parse(text);
        const sessionId = typeof payload.sessionId === "string" && payload.sessionId
          ? payload.sessionId.slice(0, 120)
          : "default";
        if (payload.type === "pause") {
          if (!running || !currentRun || currentRun.sessionId !== sessionId) continue;
          if (currentRun.controller.requestPause()) {
            sendJson(socket, { type: "run_pause_requested", sessionId });
          }
          continue;
        }
        if (payload.type === "resume") {
          if (!running || !currentRun || currentRun.sessionId !== sessionId) continue;
          currentRun.controller.resume();
          continue;
        }
        if (payload.type === "provider_settings") {
          const provider = normalizeProvider(payload.provider);
          const model = typeof payload.model === "string" ? payload.model.trim() : "";
          const baseUrl = typeof payload.baseUrl === "string" ? payload.baseUrl.trim() : "";
          const apiKey = typeof payload.apiKey === "string" ? payload.apiKey.trim() : "";
          providerSettings.set(socket, {
            provider,
            model,
            baseUrl,
            apiKey,
          });
          agentSessions.clear();
          streamStates.clear();
          sendJson(socket, {
            type: "provider_settings",
            ok: true,
            provider,
            model: model || defaultModelForProvider(provider),
            baseUrl: baseUrl || defaultBaseUrlForProvider(provider),
          });
          continue;
        }
        if (payload.type === "tool_permissions") {
          const permissions = normalizeToolPermissions(payload.permissions);
          toolPermissions.set(socket, permissions);
          agentSessions.clear();
          streamStates.clear();
          sendJson(socket, {
            type: "tool_permissions",
            ok: true,
            permissions,
          });
          continue;
        }
        if (payload.type === "reload_tools") {
          agentSessions.clear();
          streamStates.clear();
          sendJson(socket, { type: "reload_tools", ok: true });
          continue;
        }
        if (payload.type === "reload_skills") {
          agentSessions.clear();
          streamStates.clear();
          sendJson(socket, { type: "reload_skills", ok: true });
          continue;
        }
        if (payload.type === "reset") {
          const entry = agentSessions.get(sessionId);
          const agent = entry ? await entry.promise : null;
          agent?.reset();
          sendJson(socket, { type: "reset", sessionId });
          continue;
        }
        if (payload.type !== "prompt" || typeof payload.prompt !== "string") {
          sendJson(socket, { type: "error", error: "Expected a prompt message." });
          continue;
        }
        if (running) {
          sendJson(socket, { type: "error", error: "A run is already in progress." });
          continue;
        }

        running = true;
        currentRun = {
          sessionId,
          controller: createExecutionControl({
            onPaused: () => sendJson(socket, { type: "run_paused", sessionId }),
            onResumed: () => sendJson(socket, { type: "run_resumed", sessionId }),
          }),
        };
        try {
          const root = await resolveWorkspace(payload.workspace);
          const rigConfigurations = uiStateStore.getRigConfigurations();
          const activeConfiguration = rigConfigurations.configurations.find(
            (configuration) => configuration.id === rigConfigurations.activeConfigurationId,
          );
          const disabledSteps = resolveDisabledSteps(
            payload.disabledSteps,
            activeConfiguration?.componentState?.effects,
          );
          const stepsKey = disabledSteps.slice().sort().join(",");
          let entry = agentSessions.get(sessionId);
          const hasExistingAgent = entry?.root === root && entry?.stepsKey === stepsKey;
          if (!hasExistingAgent) {
            entry = {
              root,
              stepsKey,
              promise: createAgentSession(socket, sessionId, streamStates, root, disabledSteps),
            };
            agentSessions.set(sessionId, entry);
          }
          const agent = await entry.promise;
          const composedPrompt = disabledSteps.includes("composer")
            ? payload.prompt
            : await agent.refinePrompt(payload.prompt, { executionControl: currentRun.controller });
          const prompt = hasExistingAgent
            ? composedPrompt
            : promptWithHistory(composedPrompt, payload.history);
          streamStates.set(sessionId, { started: false });
          const text = await agent.run({
            text: prompt,
            images: requestImages(payload),
          }, { disabledSteps, executionControl: currentRun.controller });
          sendJson(socket, { type: "done", text, sessionId });
          streamStates.delete(sessionId);
        } catch (error) {
          sendJson(socket, { type: "error", error: error.message, sessionId });
          streamStates.delete(sessionId);
        } finally {
          running = false;
          currentRun = null;
        }
      }
    } catch (error) {
      sendJson(socket, { type: "error", error: error.message });
      closeSocket(socket, 1002, "Protocol error");
    }
  });

  const envProvider = normalizeProvider(process.env.AI_PROVIDER);
  sendJson(socket, {
    type: "ready",
    provider: envProvider,
    model: process.env.AI_MODEL || defaultModelForProvider(envProvider),
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL || "http://localhost:11434",
    customBaseUrl: process.env.CUSTOM_AI_BASE_URL || "http://localhost:8000/v1",
    approveAll: true,
  });
  socket.on("close", () => {
    providerSettings.delete(socket);
    toolPermissions.delete(socket);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (url.pathname === "/api/health") {
    const envProvider = normalizeProvider(process.env.AI_PROVIDER);
    const storedSettings = uiStateStore.getSelectedProvider() || {};
    json(res, 200, {
      ok: true,
      provider: envProvider,
      model: process.env.AI_MODEL || defaultModelForProvider(envProvider),
      ollamaModel: process.env.OLLAMA_MODEL || "llama3.1",
      ollamaBaseUrl: process.env.OLLAMA_BASE_URL || "http://localhost:11434",
      customModel: process.env.CUSTOM_AI_MODEL || "custom-model",
      customBaseUrl: process.env.CUSTOM_AI_BASE_URL || "http://localhost:8000/v1",
      hasApiKey: Boolean(storedSettings.apiKey),
      approveAll: true,
      workspace: defaultWorkspace,
    });
    return;
  }
  if (url.pathname === "/api/config") {
    await handleConfigApi(req, res);
    return;
  }
  if (url.pathname === "/api/models") {
    await handleModelsApi(req, res);
    return;
  }
  if (url.pathname === "/api/ui-state") {
    await handleUiStateApi(req, res);
    return;
  }
  if (url.pathname === "/api/rig-configurations") {
    await handleRigConfigurationsApi(req, res);
    return;
  }
  if (url.pathname === "/api/system-prompts") {
    await handleSystemPromptsApi(req, res);
    return;
  }
  if (url.pathname === "/api/skills") {
    await handleSkillsApi(req, res);
    return;
  }
  if (url.pathname === "/api/workspace-tree") {
    await handleWorkspaceTreeApi(req, res, url);
    return;
  }
  if (url.pathname === "/api/workspace-folder") {
    await handleWorkspaceFolderApi(req, res);
    return;
  }
  if (url.pathname === "/api/conversation-workspace") {
    await handleConversationWorkspaceApi(req, res);
    return;
  }
  if (url.pathname === "/api/workspace-file") {
    await handleWorkspaceFileApi(req, res, url);
    return;
  }
  if (url.pathname === "/api/workspace-file-asset") {
    await handleWorkspaceFileAssetApi(req, res, url);
    return;
  }
  if (url.pathname === "/api/workspace-recording") {
    await handleWorkspaceRecordingApi(req, res);
    return;
  }
  if (url.pathname === "/api/workspace-transcription") {
    await handleWorkspaceTranscriptionApi(req, res);
    return;
  }
  await serveStatic(req, res);
});

server.on("upgrade", (req, socket) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (url.pathname !== "/ws") {
    socket.end("HTTP/1.1 404 Not Found\r\n\r\n");
    return;
  }
  handleWebSocket(socket, req);
});

const connections = new Set();
let storeClosed = false;

server.on("connection", (socket) => {
  connections.add(socket);
  socket.on("error", (error) => {
    // Browser refreshes and closed WebSockets commonly reset the TCP stream.
    // Keep those disconnects from becoming unhandled process-level errors.
    if (!["ECONNRESET", "EPIPE"].includes(error.code)) {
      console.error("Client socket error:", error);
    }
  });
  socket.on("close", () => connections.delete(socket));
});

export function startServer({ port = defaultPort, host } = {}) {
  if (server.listening) {
    const address = server.address();
    const activePort = typeof address === "object" ? address.port : port;
    return Promise.resolve({ server, port: activePort, url: `http://127.0.0.1:${activePort}` });
  }

  return new Promise((resolve, reject) => {
    const onError = (error) => reject(error);
    server.once("error", onError);
    server.listen(port, host, () => {
      server.off("error", onError);
      const address = server.address();
      const activePort = typeof address === "object" ? address.port : port;
      const displayHost = host || "localhost";
      const url = `http://${displayHost}:${activePort}`;
      console.log(`AI Harness web UI listening on ${url}`);
      resolve({ server, port: activePort, url });
    });
  });
}

export async function stopServer() {
  if (server.listening) {
    const closed = new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    for (const socket of connections) socket.destroy();
    await closed;
  }
  if (!storeClosed) {
    uiStateStore.close();
    storeClosed = true;
  }
}

const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMainModule) await startServer();
