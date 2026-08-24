import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const CONFIG_PATH = ".ai-harness/config.toml";
const MCP_PROTOCOL_VERSION = "2024-11-05";
const MCP_HTTP_PROTOCOL_VERSION = "2025-06-18";
const MCP_STATELESS_PROTOCOL_VERSION = "2026-07-28";
const DEFAULT_MCP_STARTUP_TIMEOUT_MS = 60_000;

function mcpStartupTimeoutMs(server = {}) {
  const seconds = Number(server.startup_timeout_sec);
  return Number.isFinite(seconds) && seconds > 0
    ? seconds * 1000
    : DEFAULT_MCP_STARTUP_TIMEOUT_MS;
}

function interpolateEnv(value, env) {
  if (typeof value === "string") {
    return value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, key) => env[key] || "");
  }
  if (Array.isArray(value)) return value.map((item) => interpolateEnv(item, env));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, interpolateEnv(nested, env)]),
    );
  }
  return value;
}

function stripTomlComment(line) {
  let quote = null;
  let escaped = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quote) {
      if (char === "\\" && !escaped) escaped = true;
      else if (char === quote && !escaped) quote = null;
      else escaped = false;
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === "#") return line.slice(0, i);
  }
  return line;
}

function splitTomlList(value) {
  const parts = [];
  let quote = null;
  let escaped = false;
  let depth = 0;
  let start = 0;
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    if (quote) {
      if (char === "\\" && !escaped) escaped = true;
      else if (char === quote && !escaped) quote = null;
      else escaped = false;
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === "[" || char === "{") depth += 1;
    else if (char === "]" || char === "}") depth -= 1;
    else if (char === "," && depth === 0) {
      parts.push(value.slice(start, i).trim());
      start = i + 1;
    }
  }
  const tail = value.slice(start).trim();
  if (tail) parts.push(tail);
  return parts;
}

function parseTomlValue(raw, source) {
  const value = raw.trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1).replace(/\\"/g, '"').replace(/\\n/g, "\n");
  }
  if (value === "true") return true;
  if (value === "false") return false;
  if (value.startsWith("[") && value.endsWith("]")) {
    const inner = value.slice(1, -1).trim();
    return inner ? splitTomlList(inner).map((item) => parseTomlValue(item, source)) : [];
  }
  if (value.startsWith("{") && value.endsWith("}")) {
    const object = {};
    const inner = value.slice(1, -1).trim();
    for (const entry of inner ? splitTomlList(inner) : []) {
      const match = entry.match(/^([A-Za-z_][A-Za-z0-9_-]*)\s*=\s*(.*)$/);
      if (!match) throw new Error(`Invalid TOML inline table entry in ${source}: ${entry}`);
      object[match[1]] = parseTomlValue(match[2], source);
    }
    return object;
  }
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
  throw new Error(`Unsupported TOML value in ${source}: ${raw}`);
}

function getTable(root, pathParts) {
  let target = root;
  for (const part of pathParts) {
    if (Array.isArray(target[part])) {
      target = target[part][target[part].length - 1];
    } else {
      target[part] ||= {};
      target = target[part];
    }
  }
  return target;
}

function createArrayTable(root, pathParts) {
  const tableName = pathParts[pathParts.length - 1];
  const parent = getTable(root, pathParts.slice(0, -1));
  parent[tableName] ||= [];
  if (!Array.isArray(parent[tableName])) {
    throw new Error(`TOML table ${pathParts.join(".")} must be an array.`);
  }
  const table = {};
  parent[tableName].push(table);
  return table;
}

function parseTomlConfig(raw, source) {
  const config = {};
  let current = config;

  raw.split(/\r?\n/).forEach((rawLine, index) => {
    const line = stripTomlComment(rawLine).trim();
    if (!line) return;

    const arrayTable = line.match(/^\[\[([A-Za-z0-9_.-]+)\]\]$/);
    if (arrayTable) {
      current = createArrayTable(config, arrayTable[1].split("."));
      return;
    }

    const table = line.match(/^\[([A-Za-z0-9_.-]+)\]$/);
    if (table) {
      current = getTable(config, table[1].split("."));
      return;
    }

    const keyValue = line.match(/^([A-Za-z_][A-Za-z0-9_-]*)\s*=\s*(.*)$/);
    if (!keyValue) {
      throw new Error(`Invalid TOML in ${source} at line ${index + 1}: ${rawLine}`);
    }
    current[keyValue[1]] = parseTomlValue(keyValue[2], source);
  });

  return config;
}

function assertPlainObject(value, source) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`MCP config in ${source} must be an object or an array of servers.`);
  }
}

function parseEnvConfig(raw, source) {
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid MCP config JSON in ${source}: ${error.message}`);
  }
}

function remoteMcpServers(config, source) {
  if (Array.isArray(config)) return config;
  assertPlainObject(config, source);
  const servers = config.mcp?.servers || config.servers;
  if (!servers) return [];
  if (!Array.isArray(servers)) {
    throw new Error(`MCP config in ${source} must include an mcp.servers array.`);
  }
  return servers;
}

function stdioMcpServers(config, source) {
  if (Array.isArray(config)) return [];
  assertPlainObject(config, source);
  if (!config.mcp_servers) return [];
  assertPlainObject(config.mcp_servers, `${source} mcp_servers`);
  return Object.entries(config.mcp_servers).map(([label, server]) => ({
    ...server,
    server_label: server.server_label || label,
  }));
}

function mcpApprovalDefault(config) {
  if (Array.isArray(config)) return "always";
  return config.mcp?.auto_approve === true ? "never" : "always";
}

function validateMcpConfig(config, source) {
  if (Array.isArray(config)) return;
  assertPlainObject(config, source);
  if (config.mcp !== undefined) {
    assertPlainObject(config.mcp, `${source} mcp`);
    const allowedMcpKeys = new Set(["auto_approve", "servers"]);
    for (const key of Object.keys(config.mcp)) {
      if (!allowedMcpKeys.has(key)) {
        throw new Error(`Unsupported MCP config key in ${source}: mcp.${key}`);
      }
    }
    if (
      config.mcp.auto_approve !== undefined &&
      typeof config.mcp.auto_approve !== "boolean"
    ) {
      throw new Error(`MCP config key mcp.auto_approve in ${source} must be a boolean.`);
    }
  }
  const hasRemoteServers = config.mcp?.servers || config.servers;
  const hasStdioServers = config.mcp_servers;
  const hasMcpOptions = config.mcp && Object.keys(config.mcp).length > 0;
  if (!hasRemoteServers && !hasStdioServers && Object.keys(config).length > 0 && !hasMcpOptions) {
    throw new Error(
      `MCP config in ${source} must include mcp.servers, servers, or mcp_servers.`,
    );
  }
}

function normalizeRemoteServer(server, index, source, env, approvalDefault = "always") {
  assertPlainObject(server, `${source} server ${index + 1}`);
  const normalized = interpolateEnv(server, env);
  const label = normalized.server_label;
  if (!label || typeof label !== "string") {
    throw new Error(`MCP server ${index + 1} in ${source} is missing server_label.`);
  }
  if (!/^[A-Za-z0-9_-]+$/.test(label)) {
    throw new Error(`MCP server_label "${label}" must contain only letters, numbers, _ or -.`);
  }

  const hasServerUrl = typeof normalized.server_url === "string" && normalized.server_url.length > 0;
  const hasConnectorId = typeof normalized.connector_id === "string" &&
    normalized.connector_id.length > 0;
  if (hasServerUrl === hasConnectorId) {
    throw new Error(`MCP server "${label}" must set exactly one of server_url or connector_id.`);
  }
  if (normalized.require_approval === undefined) normalized.require_approval = approvalDefault;

  const allowedKeys = new Set([
    "allowed_tools",
    "authorization",
    "connector_id",
    "headers",
    "require_approval",
    "server_description",
    "server_label",
    "server_url",
  ]);
  const tool = { type: "mcp" };
  for (const [key, value] of Object.entries(normalized)) {
    if (allowedKeys.has(key) && value !== undefined && value !== "") tool[key] = value;
  }
  return tool;
}

function normalizeToolName(value) {
  return value.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 64);
}

function normalizeInputSchema(schema) {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    return { type: "object", properties: {}, additionalProperties: true };
  }
  if (schema.type === "object") return schema;
  return { type: "object", properties: {}, additionalProperties: true };
}

function isLoopbackUrl(value) {
  try {
    const { hostname } = new URL(value);
    return hostname === "localhost" ||
      hostname === "0.0.0.0" ||
      hostname === "::1" ||
      hostname === "[::1]" ||
      /^127(?:\.\d{1,3}){3}$/.test(hostname);
  } catch {
    return false;
  }
}

function parseSseMessages(text) {
  const messages = [];
  for (const event of text.split(/\r?\n\r?\n/)) {
    const data = event.split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (data) messages.push(JSON.parse(data));
  }
  return messages;
}

function headerValue(value) {
  const text = String(value);
  if (
    /^[\x20-\x7e]+$/.test(text) &&
    text === text.trim() &&
    !(text.startsWith("=?base64?") && text.endsWith("?="))
  ) return text;
  return `=?base64?${Buffer.from(text).toString("base64")}?=`;
}

class McpHttpClient {
  constructor({ server, onInfo = () => {}, fetchImpl = fetch }) {
    this.server = server;
    this.onInfo = onInfo;
    this.fetch = fetchImpl;
    this.nextId = 1;
    this.mode = "modern";
    this.protocolVersion = MCP_STATELESS_PROTOCOL_VERSION;
    this.sessionId = "";
    this.cachedTools = null;
  }

  baseHeaders(method, params) {
    const configured = this.server.headers && typeof this.server.headers === "object"
      ? this.server.headers
      : {};
    const headers = new Headers(configured);
    headers.set("accept", "application/json, text/event-stream");
    headers.set("content-type", "application/json");
    if (this.server.authorization && !headers.has("authorization")) {
      const authorization = String(this.server.authorization);
      headers.set(
        "authorization",
        /^[A-Za-z][A-Za-z0-9_-]*\s/.test(authorization)
          ? authorization
          : `Bearer ${authorization}`,
      );
    }
    if (this.mode === "modern") {
      headers.set("MCP-Protocol-Version", MCP_STATELESS_PROTOCOL_VERSION);
      headers.set("Mcp-Method", method);
      if (params.name !== undefined) headers.set("Mcp-Name", headerValue(params.name));
      else if (params.uri !== undefined) headers.set("Mcp-Name", headerValue(params.uri));
    } else {
      if (this.sessionId) headers.set("Mcp-Session-Id", this.sessionId);
      if (method !== "initialize" && this.protocolVersion) {
        headers.set("MCP-Protocol-Version", this.protocolVersion);
      }
    }
    return headers;
  }

  requestParams(params) {
    if (this.mode !== "modern") return params;
    return {
      ...params,
      _meta: {
        ...(params._meta || {}),
        "io.modelcontextprotocol/protocolVersion": MCP_STATELESS_PROTOCOL_VERSION,
        "io.modelcontextprotocol/clientInfo": { name: "ai-harness", version: "1.0.0" },
        "io.modelcontextprotocol/clientCapabilities": {},
      },
    };
  }

  async post(payload, method, params, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await this.fetch(this.server.server_url, {
        method: "POST",
        headers: this.baseHeaders(method, params),
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (error) {
      clearTimeout(timer);
      if (error.name === "AbortError") {
        throw new Error(`MCP HTTP request timed out: ${method} (${this.server.server_url})`);
      }
      throw new Error(`Could not call MCP server ${this.server.server_url}: ${error.message}`);
    }

    const sessionId = response.headers.get("mcp-session-id");
    if (sessionId) this.sessionId = sessionId;
    let text;
    try {
      text = await response.text();
    } catch (error) {
      if (error.name === "AbortError") {
        throw new Error(`MCP HTTP request timed out: ${method} (${this.server.server_url})`);
      }
      throw new Error(`Could not read MCP response from ${this.server.server_url}: ${error.message}`);
    } finally {
      clearTimeout(timer);
    }
    let messages = [];
    try {
      messages = response.headers.get("content-type")?.includes("text/event-stream")
        ? parseSseMessages(text)
        : text ? [JSON.parse(text)] : [];
    } catch (error) {
      const invalid = new Error(
        `MCP server ${this.server.server_url} returned invalid JSON (HTTP ${response.status}): ${text}`,
      );
      invalid.status = response.status;
      throw invalid;
    }
    if (!response.ok) {
      const rpcError = messages.find((message) => message?.error)?.error;
      const detail = rpcError?.message || text || response.statusText;
      const failure = new Error(
        `MCP server ${this.server.server_url} returned HTTP ${response.status}: ${detail}`,
      );
      failure.status = response.status;
      failure.rpcError = rpcError;
      throw failure;
    }
    return messages;
  }

  async request(method, params = {}, timeoutMs = 60_000) {
    const id = this.nextId;
    this.nextId += 1;
    const encodedParams = this.requestParams(params);
    const messages = await this.post(
      { jsonrpc: "2.0", id, method, params: encodedParams },
      method,
      encodedParams,
      timeoutMs,
    );
    const message = messages.find((candidate) => candidate?.id === id) ||
      messages.find((candidate) => Object.hasOwn(candidate || {}, "result") || candidate?.error);
    if (!message) throw new Error(`MCP server returned no response for ${method}.`);
    if (message.error) {
      const failure = new Error(message.error.message || JSON.stringify(message.error));
      failure.rpcError = message.error;
      throw failure;
    }
    return message.result;
  }

  async notify(method, params = {}) {
    const encodedParams = this.requestParams(params);
    await this.post(
      { jsonrpc: "2.0", method, params: encodedParams },
      method,
      encodedParams,
      10_000,
    );
  }

  async connect() {
    this.onInfo(`Connecting local HTTP MCP server ${this.server.server_label}.`);
    try {
      this.mode = "modern";
      this.protocolVersion = MCP_STATELESS_PROTOCOL_VERSION;
      this.cachedTools = await this.request("tools/list", {}, 10_000);
    } catch (error) {
      const legacyHandshakeRequired = [400, 404, 405].includes(error.status) ||
        error.rpcError?.code === -32002 ||
        /not initialized/i.test(error.message);
      if (!legacyHandshakeRequired) throw error;
      this.mode = "legacy";
      this.protocolVersion = MCP_HTTP_PROTOCOL_VERSION;
      this.sessionId = "";
      const result = await this.request("initialize", {
        protocolVersion: MCP_HTTP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: "ai-harness", version: "1.0.0" },
      }, 10_000);
      this.protocolVersion = result.protocolVersion || MCP_HTTP_PROTOCOL_VERSION;
      await this.notify("notifications/initialized");
    }
    this.onInfo(`Connected local HTTP MCP server ${this.server.server_label}.`);
  }

  async listTools() {
    this.onInfo(`Loading tools from MCP server ${this.server.server_label}.`);
    const result = this.cachedTools || await this.request("tools/list", {});
    this.cachedTools = null;
    return result.tools || [];
  }

  async callTool(name, args) {
    this.onInfo(`Using MCP server ${this.server.server_label}.${name}.`);
    return this.request("tools/call", { name, arguments: args || {} });
  }
}

function allowedToolNames(value) {
  if (!Array.isArray(value)) return null;
  return new Set(value.map((item) => typeof item === "string" ? item : item?.name).filter(Boolean));
}

async function loadHttpServerTools({ server, approve, onInfo }) {
  const client = new McpHttpClient({ server, onInfo });
  await client.connect();
  const allowed = allowedToolNames(server.allowed_tools);
  const tools = await client.listTools();
  return tools
    .filter((tool) => !allowed || allowed.has(tool.name))
    .map((tool) => {
      const toolName = normalizeToolName(`${server.server_label}__${tool.name}`);
      return {
        name: toolName,
        description: tool.description || `Call ${tool.name} on MCP server ${server.server_label}.`,
        parameters: normalizeInputSchema(tool.inputSchema),
        strict: false,
        async execute(args) {
          if (server.require_approval !== "never") {
            const approved = await approve(
              `MCP ${server.server_label}.${tool.name} ${JSON.stringify(args || {})}`,
            );
            if (!approved) return { ok: false, error: "User denied MCP tool call." };
          }
          return client.callTool(tool.name, args);
        },
      };
    });
}

class McpStdioClient {
  constructor({ server, source, env, onInfo = () => {} }) {
    this.server = server;
    this.source = source;
    this.env = env;
    this.onInfo = onInfo;
    this.format = server.message_format || "content-length";
    this.nextId = 1;
    this.pending = new Map();
    this.buffer = Buffer.alloc(0);
    this.lineBuffer = "";
    this.stderr = "";
    this.child = null;
  }

  connect() {
    if (this.child) return;
    if (!this.server.command || typeof this.server.command !== "string") {
      throw new Error(`MCP server "${this.server.server_label}" in ${this.source} is missing command.`);
    }

    const args = Array.isArray(this.server.args) ? this.server.args.map(String) : [];
    const cwd = this.server.cwd ? path.resolve(String(this.server.cwd)) : undefined;
    this.onInfo(`Connecting MCP server ${this.server.server_label}.`);
    this.child = spawn(this.server.command, args, {
      cwd,
      env: { ...process.env, ...this.env, ...(this.server.env || {}) },
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child.unref();
    this.child.stdin.unref();
    this.child.stdout.unref();
    this.child.stderr.unref();
    this.child.stdout.on("data", (chunk) => this.readChunk(chunk));
    this.child.stderr.on("data", (chunk) => {
      this.stderr = `${this.stderr}${chunk}`.slice(-20_000);
    });
    this.child.on("exit", (code, signal) => {
      const error = new Error(
        `MCP server "${this.server.server_label}" exited` +
          `${signal ? ` with signal ${signal}` : ` with code ${code}`}.`,
      );
      for (const { reject } of this.pending.values()) reject(error);
      this.pending.clear();
    });
    process.once("exit", () => this.child?.kill());
  }

  readChunk(chunk) {
    if (this.format === "json-lines") {
      this.lineBuffer += chunk.toString("utf8");
      const lines = this.lineBuffer.split(/\r?\n/);
      this.lineBuffer = lines.pop() || "";
      for (const line of lines) {
        if (line.trim()) this.handleMessage(JSON.parse(line));
      }
      return;
    }

    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (true) {
      const headerEnd = this.buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) return;
      const header = this.buffer.slice(0, headerEnd).toString("utf8");
      const match = header.match(/content-length:\s*(\d+)/i);
      if (!match) {
        this.buffer = Buffer.alloc(0);
        return;
      }
      const length = Number(match[1]);
      const messageStart = headerEnd + 4;
      const messageEnd = messageStart + length;
      if (this.buffer.length < messageEnd) return;
      const body = this.buffer.slice(messageStart, messageEnd).toString("utf8");
      this.buffer = this.buffer.slice(messageEnd);
      this.handleMessage(JSON.parse(body));
    }
  }

  handleMessage(message) {
    if (!Object.hasOwn(message, "id")) return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    if (message.error) {
      pending.reject(new Error(message.error.message || JSON.stringify(message.error)));
    } else {
      pending.resolve(message.result);
    }
  }

  request(method, params = {}, timeoutMs = this.server.tool_timeout_sec * 1000 || 60_000) {
    this.connect();
    const id = this.nextId;
    this.nextId += 1;
    const payload = JSON.stringify({ jsonrpc: "2.0", id, method, params });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(
          `MCP request timed out: ${method}` +
            (this.stderr ? `\n${this.stderr.trim()}` : ""),
        ));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      this.writePayload(payload);
    });
  }

  notify(method, params = {}) {
    this.connect();
    const payload = JSON.stringify({ jsonrpc: "2.0", method, params });
    this.writePayload(payload);
  }

  writePayload(payload) {
    if (this.format === "json-lines") {
      this.child.stdin.write(`${payload}\n`);
      return;
    }
    this.child.stdin.write(`Content-Length: ${Buffer.byteLength(payload)}\r\n\r\n${payload}`);
  }

  close() {
    this.child?.kill();
  }

  async initialize() {
    await this.request("initialize", {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "ai-harness", version: "1.0.0" },
    }, mcpStartupTimeoutMs(this.server));
    this.notify("notifications/initialized");
    this.onInfo(`Connected MCP server ${this.server.server_label}.`);
  }

  async listTools() {
    this.onInfo(`Loading tools from MCP server ${this.server.server_label}.`);
    const result = await this.request("tools/list", {});
    return result.tools || [];
  }

  async callTool(name, args) {
    this.onInfo(`Using MCP server ${this.server.server_label}.${name}.`);
    return this.request("tools/call", { name, arguments: args || {} });
  }
}

async function loadStdioServerTools({
  server,
  index,
  source,
  env,
  approve,
  onInfo,
  approvalDefault = "always",
  autoApprove = false,
}) {
  assertPlainObject(server, `${source} mcp_servers entry ${index + 1}`);
  const normalized = interpolateEnv(server, env);
  normalized.require_approval = autoApprove
    ? "never"
    : normalized.require_approval ?? approvalDefault;
  const label = normalized.server_label;
  if (!label || typeof label !== "string") {
    throw new Error(`MCP stdio server ${index + 1} in ${source} is missing server_label.`);
  }
  if (!/^[A-Za-z0-9_-]+$/.test(label)) {
    throw new Error(`MCP server_label "${label}" must contain only letters, numbers, _ or -.`);
  }

  const client = new McpStdioClient({ server: normalized, source, env, onInfo });
  try {
    await client.initialize();
  } catch (error) {
    if (normalized.message_format || !/timed out: initialize/.test(error.message)) throw error;
    client.close();
    normalized.message_format = "json-lines";
    onInfo(`Retrying MCP server ${label} with json-lines message format.`);
    const fallbackClient = new McpStdioClient({ server: normalized, source, env, onInfo });
    await fallbackClient.initialize();
    return loadStdioToolsFromClient({ client: fallbackClient, normalized, label, approve });
  }
  return loadStdioToolsFromClient({ client, normalized, label, approve });
}

async function loadStdioToolsFromClient({ client, normalized, label, approve }) {
  const tools = await client.listTools();
  return tools.map((tool) => {
    const toolName = normalizeToolName(`${label}__${tool.name}`);
    return {
      name: toolName,
      description: tool.description || `Call ${tool.name} on MCP server ${label}.`,
      parameters: normalizeInputSchema(tool.inputSchema),
      strict: false,
      async execute(args) {
        if (normalized.require_approval !== "never") {
          const approved = await approve(`MCP ${label}.${tool.name} ${JSON.stringify(args || {})}`);
          if (!approved) return { ok: false, error: "User denied MCP tool call." };
        }
        return client.callTool(tool.name, args);
      },
    };
  });
}

async function loadMcpTools({
  root,
  configContent,
  env = process.env,
  approve = async () => false,
  onInfo = () => {},
  autoApprove = false,
} = {}) {
  const configs = [];
  if (env.AI_HARNESS_MCP_SERVERS) {
    configs.push({
      source: "AI_HARNESS_MCP_SERVERS",
      config: parseEnvConfig(env.AI_HARNESS_MCP_SERVERS, "AI_HARNESS_MCP_SERVERS"),
    });
  }

  if (configContent !== undefined) {
    configs.push({
      source: "SQLite MCP configuration",
      config: parseTomlConfig(configContent, "SQLite MCP configuration"),
    });
  } else if (root) {
    const file = path.join(root, CONFIG_PATH);
    try {
      configs.push({
        source: CONFIG_PATH,
        config: parseTomlConfig(await fs.readFile(file, "utf8"), CONFIG_PATH),
      });
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }

  const tools = [];
  for (const { source, config } of configs) {
    validateMcpConfig(config, source);
    const approvalDefault = mcpApprovalDefault(config);
    for (const [index, server] of remoteMcpServers(config, source).entries()) {
      const tool = normalizeRemoteServer(server, index, source, env, approvalDefault);
      if (autoApprove) tool.require_approval = "never";
      if (tool.server_url && isLoopbackUrl(tool.server_url)) {
        tools.push(...await loadHttpServerTools({ server: tool, approve, onInfo }));
      } else {
        onInfo(`Loaded remote MCP server ${tool.server_label}.`);
        tools.push(tool);
      }
    }
    for (const [index, server] of stdioMcpServers(config, source).entries()) {
      tools.push(...await loadStdioServerTools({
        server,
        index,
        source,
        env,
        approve,
        onInfo,
        approvalDefault,
        autoApprove,
      }));
    }
  }
  return tools;
}

export { loadMcpTools, mcpStartupTimeoutMs };
