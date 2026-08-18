import assert from "node:assert/strict";
import test from "node:test";

import { mcpBlocks, replaceToolBlock, updateToolBlock } from "../public/lib/mcp-config.js";

const configuration = `[[mcp.servers]]
server_label = "docs"
server_url = "https://example.com/mcp"
require_approval = "always"

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
require_approval = "always"`);

  assert.match(updated, /server_label = "reference"/);
  assert.match(updated, /server_url = "https:\/\/reference\.example\.com\/mcp"/);
  assert.match(updated, /require_approval = "always"/);
  assert.match(updated, /\[mcp_servers\.local\]/);
});
