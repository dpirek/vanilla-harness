const CONFIG_TEMPLATES = {
  remote: `
[[mcp.servers]]
server_label = "docs"
server_url = "https://example.com/mcp"
allowed_tools = ["search"]
require_approval = "always"

[mcp.servers.headers]
Authorization = "Bearer \${MCP_TOKEN}"
`,
  stdio: `
[mcp_servers.local]
command = "node"
args = ["/absolute/path/to/server.js"]
cwd = "/absolute/path/to/server"
message_format = "content-length"
`,
  autoApprove: `
[mcp]
auto_approve = true
`,
};

function stripTomlComment(line) {
  return line.replace(/^\s*#\s?/, "");
}

function mcpBlocks(content) {
  const lines = content.split("\n");
  const headerPattern = /^\s*(#\s*)?(\[\[mcp\.servers\]\]|\[mcp_servers\.([A-Za-z0-9_-]+)\])\s*$/;
  const starts = [];
  lines.forEach((line, index) => {
    const match = line.match(headerPattern);
    if (match) starts.push({ index, match });
  });
  return starts.map((start, listIndex) => {
    const end = starts[listIndex + 1]?.index ?? lines.length;
    const blockLines = lines.slice(start.index, end);
    const uncommented = blockLines.map(stripTomlComment).join("\n");
    const isRemote = start.match[2] === "[[mcp.servers]]";
    return {
      index: listIndex,
      start: start.index,
      end,
      enabled: !start.match[1],
      type: isRemote ? "remote" : "stdio",
      label: isRemote ? uncommented.match(/server_label\s*=\s*"([^"]+)"/)?.[1] || "remote" : start.match[3],
      detail: isRemote
        ? uncommented.match(/server_url\s*=\s*"([^"]+)"/)?.[1] || uncommented.match(/connector_id\s*=\s*"([^"]+)"/)?.[1] || "remote MCP server"
        : uncommented.match(/command\s*=\s*"([^"]+)"/)?.[1] || "stdio MCP server",
    };
  });
}

function setToolBlockEnabled(content, block, enabled) {
  const lines = content.split("\n");
  const changed = lines.slice(block.start, block.end).map((line) => {
    if (!line.trim()) return line;
    if (enabled) return line.replace(/^(\s*)#\s?/, "$1");
    return /^\s*#/.test(line) ? line : `# ${line}`;
  });
  lines.splice(block.start, block.end - block.start, ...changed);
  return lines.join("\n");
}

function quoteToml(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export { CONFIG_TEMPLATES, mcpBlocks, quoteToml, setToolBlockEnabled };
