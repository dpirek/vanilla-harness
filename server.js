import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApiRouter } from "./api/index.js";
import { createModelClient } from "./lib/openai.js";
import { CodingAgent } from "./lib/agent.js";
import { serveStatic } from "./lib/response.js";
import { createTools } from "./lib/tools/index.js";
import { loadMcpTools } from "./lib/mcp.js";
import {
  createUiStateStore,
  normalizeStoredToolPermissions as normalizeToolPermissions,
} from "./lib/ui-state.js";
import { attachWebSocketServer, createWebSocketHandler } from "./lib/ws.js";
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

const defaultPort = Number(process.env.PORT || 3000);
await fs.mkdir(databaseDir, { recursive: true });
const connections = new Set();
let storeClosed = false;

async function initializeUiStateStore(databasePath, initialMcpConfigPath) {
  const store = createUiStateStore(databasePath);
  if (store.getMcpConfig() === undefined) {
    try {
      store.setMcpConfig(await fs.readFile(initialMcpConfigPath, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return store;
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

async function createAgentSession({
  disabledSteps = [],
  emit,
  onTextDelta,
  providerSettings = {},
  root,
  toolPermissions,
}) {
  const storedSettings = uiStateStore.getAll().providerSettings || {};
  const settings = { ...storedSettings, ...providerSettings };
  const provider = normalizeProvider(settings.provider || process.env.AI_PROVIDER);
  const model = settings.model ||
    process.env.AI_MODEL ||
    defaultModelForProvider(provider);
  const approveMcp = async () => true;
  const onInfo = (message) => emit({ type: "info", message });
  const onTool = ({ name, args }) => emit({ type: "tool", name, args });
  const onEvent = (event) => emit({ type: "agent_event", event });

  const apiKey = resolveProviderApiKey(provider, settings.apiKey);
  if (provider === "openai" && !apiKey) {
    throw new Error("Save an OpenAI API key in Provider settings first.");
  }

  const client = createModelClient({
    provider,
    apiKey,
    baseUrl: settings.baseUrl || defaultBaseUrlForProvider(provider),
  });
  // Enabling a built-in tool in the web Tools settings is the user's
  // authorization to execute it. Disabled tools are not exposed to the model.
  const disabled = new Set(disabledSteps);
  const localTools = disabled.has("tools") ? [] : createTools({ root, approve: async () => true })
    .filter((tool) => toolPermissions[tool.name] === true);
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

function startServer({ port = defaultPort, host } = {}) {
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

const handleWebSocket = createWebSocketHandler({
  createAgentSession,
  getRigConfigurations: () => uiStateStore.getRigConfigurations(),
  normalizeToolPermissions,
  resolveWorkspace,
});

const uiStateStore = await initializeUiStateStore(uiStateDatabasePath, configPath);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const handleApiRequest = createApiRouter({ uiStateStore, defaultWorkspace, resolveWorkspace });

  if (await handleApiRequest(req, res, url)) return;
  await serveStatic(req, res, publicDir);
});

attachWebSocketServer(server, handleWebSocket);

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

await startServer();
