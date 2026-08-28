import crypto from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApiRouter } from "./api/index.js";
import { createModelClient } from "./lib/openai.js";
import { CodingAgent, resolveDisabledSteps } from "./lib/agent.js";
import { serveStatic } from "./lib/response.js";
import { createTools } from "./lib/tools/index.js";
import { loadMcpTools } from "./lib/mcp.js";
import {
  createUiStateStore,
  normalizeStoredToolPermissions as normalizeToolPermissions,
} from "./lib/ui-state.js";
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

const WEBSOCKET_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const MAX_WEBSOCKET_TEXT_BYTES = 40 * 1024 * 1024;
const providerSettings = new Map();
const toolPermissions = new Map();

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

const handleApiRequest = createApiRouter({ uiStateStore, defaultWorkspace, resolveWorkspace });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (await handleApiRequest(req, res, url)) return;
  await serveStatic(req, res, publicDir);
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
