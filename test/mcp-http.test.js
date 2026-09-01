import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { loadMcpTools } from "../lib/mcp.js";

async function requestJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function startMcpServer(handler) {
  const server = http.createServer(async (req, res) => {
    try {
      await handler(req, res, await requestJson(req));
    } catch (error) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: error.message }));
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}/mcp`,
    close: () => new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    }),
  };
}

function config(url, headers = "") {
  return `[mcp]
auto_approve = false

[[mcp.servers]]
server_label = "local"
server_url = "${url}"
require_approval = "always"
${headers}
`;
}

test("loopback MCP URLs use local Streamable HTTP with legacy session fallback", async () => {
  const methods = [];
  const mcp = await startMcpServer((req, res, message) => {
    methods.push(message.method);
    assert.match(req.headers.accept, /application\/json/);
    assert.match(req.headers.accept, /text\/event-stream/);

    if (req.headers["mcp-protocol-version"] === "2026-07-28") {
      res.writeHead(400);
      res.end();
      return;
    }
    if (message.method === "initialize") {
      res.writeHead(200, {
        "content-type": "application/json",
        "mcp-session-id": "test-session",
      });
      res.end(JSON.stringify({
        jsonrpc: "2.0",
        id: message.id,
        result: {
          protocolVersion: "2025-06-18",
          capabilities: { tools: {} },
          serverInfo: { name: "test", version: "1" },
        },
      }));
      return;
    }
    assert.equal(req.headers["mcp-session-id"], "test-session");
    if (message.method === "notifications/initialized") {
      res.writeHead(202);
      res.end();
      return;
    }
    if (message.method === "tools/list") {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.end(`event: message\ndata: ${JSON.stringify({
        jsonrpc: "2.0",
        id: message.id,
        result: {
          tools: [{
            name: "echo",
            description: "Echo text",
            inputSchema: {
              type: "object",
              properties: { text: { type: "string" } },
              required: ["text"],
            },
          }],
        },
      })}\n\n`);
      return;
    }
    assert.equal(message.method, "tools/call");
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({
      jsonrpc: "2.0",
      id: message.id,
      result: { content: [{ type: "text", text: message.params.arguments.text }] },
    }));
  });

  try {
    const tools = await loadMcpTools({
      configContent: config(mcp.url),
      autoApprove: true,
      approve: async () => { throw new Error("Approval callback should not run."); },
    });
    assert.deepEqual(tools.map((tool) => tool.name), ["local__echo"]);
    assert.deepEqual(await tools[0].execute({ text: "hello" }), {
      content: [{ type: "text", text: "hello" }],
    });
    assert.deepEqual(methods, [
      "tools/list",
      "initialize",
      "notifications/initialized",
      "tools/list",
      "tools/call",
    ]);
  } finally {
    await mcp.close();
  }
});

test("loopback MCP URLs support the stateless 2026 protocol", async () => {
  const mcp = await startMcpServer((req, res, message) => {
    assert.equal(req.headers.authorization, "Bearer secret-token");
    assert.equal(req.headers["x-tenant"], "docs");
    assert.equal(req.headers["mcp-protocol-version"], "2026-07-28");
    assert.equal(req.headers["mcp-method"], message.method);
    assert.equal(
      message.params._meta["io.modelcontextprotocol/protocolVersion"],
      "2026-07-28",
    );
    if (message.method === "tools/list") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        jsonrpc: "2.0",
        id: message.id,
        result: {
          tools: [{ name: "ping", inputSchema: { type: "object", properties: {} } }],
        },
      }));
      return;
    }
    assert.equal(req.headers["mcp-name"], "ping");
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ jsonrpc: "2.0", id: message.id, result: { ok: true } }));
  });

  try {
    const tools = await loadMcpTools({
      configContent: config(mcp.url, `[mcp.servers.headers]
"Authorization" = "Bearer \${MCP_TOKEN}"
"X-Tenant" = "docs"`),
      env: { MCP_TOKEN: "secret-token" },
      autoApprove: true,
      approve: async () => { throw new Error("Approval callback should not run."); },
    });
    assert.deepEqual(await tools[0].execute({}), { ok: true });
  } finally {
    await mcp.close();
  }
});

test("non-loopback MCP URLs remain provider-managed remote tools", async () => {
  const tools = await loadMcpTools({
    configContent: config("https://example.com/mcp", `[mcp.servers.headers]
"Authorization" = "Bearer \${MCP_TOKEN}"`),
    env: { MCP_TOKEN: "remote-secret" },
    autoApprove: true,
  });
  assert.equal(tools[0].type, "mcp");
  assert.equal(tools[0].server_url, "https://example.com/mcp");
  assert.equal(tools[0].require_approval, "never");
  assert.deepEqual(tools[0].headers, { Authorization: "Bearer remote-secret" });
});
