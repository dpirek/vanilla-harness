import assert from "node:assert/strict";
import test from "node:test";

import {
  formatHttpHeaders,
  httpHeadersToml,
  importMcpConfig,
  mcpBlocks,
  parseHttpHeaders,
  replaceToolBlock,
  updateToolBlock,
} from "../public/lib/mcp-config.js";

const configuration = `[[mcp.servers]]
server_label = "docs"
server_url = "https://example.com/mcp"
require_approval = "always"

[mcp.servers.headers]
"Authorization" = "Bearer \${MCP_TOKEN}"
"X-API-Key" = "key:with:colons"

[mcp_servers.local]
command = "node"
args = ["server.js", "--stdio"]
cwd = "/workspace"
message_format = "content-length"

[mcp]
auto_approve = true
`;

test("MCP blocks expose values used by the edit form", () => {
  const [remote, stdio] = mcpBlocks(configuration);
  assert.deepEqual(
    { label: remote.label, type: remote.type, url: remote.url },
    { label: "docs", type: "remote", url: "https://example.com/mcp" },
  );
  assert.deepEqual(remote.headers, {
    Authorization: "Bearer ${MCP_TOKEN}",
    "X-API-Key": "key:with:colons",
  });
  assert.deepEqual(
    { label: stdio.label, type: stdio.type, command: stdio.command, args: stdio.args, cwd: stdio.cwd },
    { label: "local", type: "stdio", command: "node", args: ["server.js", "--stdio"], cwd: "/workspace" },
  );
});

test("replacing an MCP server preserves other servers and global MCP settings", () => {
  const [remote] = mcpBlocks(configuration);
  const updated = replaceToolBlock(configuration, remote, `[[mcp.servers]]
server_label = "search"
server_url = "https://search.example.com/mcp"
require_approval = "always"`);

  assert.match(updated, /server_label = "search"/);
  assert.doesNotMatch(updated, /server_label = "docs"/);
  assert.match(updated, /\[mcp_servers\.local\]/);
  assert.match(updated, /\[mcp\]\nauto_approve = true/);
});

test("deleting an MCP server preserves global MCP settings", () => {
  const stdio = mcpBlocks(configuration)[1];
  const updated = replaceToolBlock(configuration, stdio);

  assert.doesNotMatch(updated, /\[mcp_servers\.local\]/);
  assert.match(updated, /server_label = "docs"/);
  assert.match(updated, /\[mcp\]\nauto_approve = true/);
});

test("editing an MCP server preserves its additional settings", () => {
  const remote = mcpBlocks(configuration)[0];
  const updated = updateToolBlock(configuration, remote, `[[mcp.servers]]
server_label = "reference"
server_url = "https://reference.example.com/mcp"
require_approval = "always"

[mcp.servers.headers]
"Authorization" = "Bearer replacement"
"X-Tenant" = "docs"`);

  assert.match(updated, /server_label = "reference"/);
  assert.match(updated, /server_url = "https:\/\/reference\.example\.com\/mcp"/);
  assert.match(updated, /require_approval = "always"/);
  assert.match(updated, /"Authorization" = "Bearer replacement"/);
  assert.match(updated, /"X-Tenant" = "docs"/);
  assert.doesNotMatch(updated, /X-API-Key/);
  assert.match(updated, /\[mcp_servers\.local\]/);
});

test("HTTP header helpers accept bearer tokens and serialize TOML", () => {
  const input = "Authorization: Bearer ${MCP_TOKEN}\nX-API-Key: key:with:colons";
  assert.deepEqual(parseHttpHeaders(input), {
    Authorization: "Bearer ${MCP_TOKEN}",
    "X-API-Key": "key:with:colons",
  });
  assert.equal(formatHttpHeaders(parseHttpHeaders(input)), input);
  assert.equal(httpHeadersToml(input), `[mcp.servers.headers]
"Authorization" = "Bearer \${MCP_TOKEN}"
"X-API-Key" = "key:with:colons"`);
});

test("HTTP header helpers reject malformed and duplicate headers", () => {
  assert.throws(() => parseHttpHeaders("Authorization Bearer token"), /line 1/);
  assert.throws(
    () => parseHttpHeaders("Authorization: Bearer one\nauthorization: Bearer two"),
    /Duplicate HTTP header/,
  );
});


test("JSON MCP import adds Playwright and preserves existing configuration", () => {
  const result = importMcpConfig(JSON.stringify({ mcpServers: {
    playwright: { command: "npx", args: ["@playwright/mcp@latest", "--name=two words"] },
  } }), configuration);
  assert.ok(result.startsWith(configuration.trimEnd()));
  const imported = mcpBlocks(result).at(-1);
  assert.equal(imported.label, "playwright");
  assert.equal(imported.command, "npx");
  assert.deepEqual(imported.args, ["@playwright/mcp@latest", "--name=two words"]);
});

test("JSON MCP import supports multiple servers, environment and remote headers", () => {
  const result = importMcpConfig(JSON.stringify({ mcpServers: {
    local: { command: "node", cwd: "/workspace", env: { TOKEN: "secret" } },
    docs: { url: "https://example.com/mcp", headers: { Authorization: "Bearer token" } },
  } }));
  assert.equal(mcpBlocks(result).length, 2);
  assert.match(result, /\[mcp_servers.local.env\]/);
  assert.match(result, /"TOKEN" = "secret"/);
  assert.deepEqual(mcpBlocks(result)[1].headers, { Authorization: "Bearer token" });
});

test("JSON MCP import rejects malformed, duplicate and unsupported entries", () => {
  assert.throws(() => importMcpConfig("{"), /valid JSON/);
  for (const value of [null, [], {}, { mcpServers: {} }, { mcpServers: [] }]) {
    assert.throws(() => importMcpConfig(JSON.stringify(value)), /mcpServers/);
  }
  const wrap = (servers) => JSON.stringify({ mcpServers: servers });
  assert.throws(() => importMcpConfig(wrap({ local: { command: "node" } }), configuration), /already exists/);
  assert.throws(() => importMcpConfig(wrap({ invalid: { command: "node", args: "script.js" } })), /array/);
  assert.throws(() => importMcpConfig(wrap({ invalid: { command: "node", args: [42] } })), /strings/);
  assert.throws(() => importMcpConfig(wrap({ invalid: { command: "node", disabled: true } })), /Unsupported field/);
  assert.throws(() => importMcpConfig(wrap({ "invalid.name": { command: "node" } })), /Invalid server name/);
});
