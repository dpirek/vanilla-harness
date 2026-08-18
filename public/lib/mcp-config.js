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

function unquoteToml(value = "") {
  return value.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
}

function tomlString(content, key) {
  const match = content.match(new RegExp(`^\\s*${key}\\s*=\\s*"((?:\\\\.|[^"\\\\])*)"`, "m"));
  return match ? unquoteToml(match[1]) : "";
}

function tomlStringArray(content, key) {
  const match = content.match(new RegExp(`^\\s*${key}\\s*=\\s*\\[([^\\]]*)\\]`, "m"));
  if (!match) return [];
  return [...match[1].matchAll(/"((?:\\.|[^"\\])*)"/g)].map((entry) => unquoteToml(entry[1]));
}

function blockEnd(lines, start, type, label) {
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = stripTomlComment(lines[index]).trim();
    if (!line.startsWith("[")) continue;
    if (type === "remote" && /^\[mcp\.servers\.[A-Za-z0-9_-]+\]$/.test(line)) continue;
    if (type === "stdio" && line.startsWith(`[mcp_servers.${label}.`)) continue;
    return index;
  }
  return lines.length;
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
    const isRemote = start.match[2] === "[[mcp.servers]]";
    const fallbackLabel = isRemote ? "remote" : start.match[3];
    const end = Math.min(
      starts[listIndex + 1]?.index ?? lines.length,
      blockEnd(lines, start.index, isRemote ? "remote" : "stdio", fallbackLabel),
    );
    const blockLines = lines.slice(start.index, end);
    const uncommented = blockLines.map(stripTomlComment).join("\n");
    return {
      index: listIndex,
      start: start.index,
      end,
      enabled: !start.match[1],
      type: isRemote ? "remote" : "stdio",
      label: isRemote ? tomlString(uncommented, "server_label") || "remote" : start.match[3],
      detail: isRemote
        ? tomlString(uncommented, "server_url") || tomlString(uncommented, "connector_id") || "remote MCP server"
        : tomlString(uncommented, "command") || "stdio MCP server",
      url: isRemote ? tomlString(uncommented, "server_url") : "",
      command: isRemote ? "" : tomlString(uncommented, "command"),
      args: isRemote ? [] : tomlStringArray(uncommented, "args"),
      cwd: isRemote ? "" : tomlString(uncommented, "cwd"),
    };
  });
}

function replaceToolBlock(content, block, replacement = "") {
  const lines = content.split("\n");
  const nextLines = replacement.trim() ? replacement.trim().split("\n") : [];
  lines.splice(block.start, block.end - block.start, ...nextLines);
  const normalized = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return normalized ? `${normalized}\n` : "";
}

function updateToolBlock(content, block, replacement) {
  const lines = content.split("\n").slice(block.start, block.end);
  const replacementBlock = mcpBlocks(replacement)[0];
  const replacementLines = replacement.split("\n");
  if (!replacementBlock || replacementBlock.type !== block.type) {
    throw new Error("The MCP server type cannot be changed while editing.");
  }

  const commentPrefix = block.enabled ? "" : "# ";
  const findAssignment = (source, key) => source.findIndex((line) =>
    new RegExp(`^\\s*${key}\\s*=`).test(stripTomlComment(line))
  );
  const patchAssignment = (key, { after, optional = false } = {}) => {
    const currentIndex = findAssignment(lines, key);
    const replacementIndex = findAssignment(replacementLines, key);
    if (replacementIndex < 0) {
      if (optional && currentIndex >= 0) lines.splice(currentIndex, 1);
      return;
    }
    const nextLine = stripTomlComment(replacementLines[replacementIndex]).trim();
    if (currentIndex >= 0) {
      const prefix = lines[currentIndex].match(/^(\s*(?:#\s*)?)/)?.[1] || commentPrefix;
      lines[currentIndex] = `${prefix}${nextLine}`;
      return;
    }
    const afterIndex = findAssignment(lines, after);
    lines.splice(afterIndex >= 0 ? afterIndex + 1 : 1, 0, `${commentPrefix}${nextLine}`);
  };

  if (block.type === "remote") {
    patchAssignment("server_label");
    patchAssignment("server_url", { after: "server_label" });
  } else {
    const headerPrefix = lines[0].match(/^(\s*(?:#\s*)?)/)?.[1] || commentPrefix;
    lines[0] = `${headerPrefix}[mcp_servers.${replacementBlock.label}]`;
    patchAssignment("command");
    patchAssignment("args", { after: "command" });
    patchAssignment("cwd", { after: "args", optional: true });
  }

  return replaceToolBlock(content, block, lines.join("\n"));
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

export { CONFIG_TEMPLATES, mcpBlocks, quoteToml, replaceToolBlock, setToolBlockEnabled, updateToolBlock };
