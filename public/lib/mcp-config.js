const CONFIG_TEMPLATES = {
  remote: `
[[mcp.servers]]
server_label = "docs"
server_url = "https://example.com/mcp"
allowed_tools = ["search"]
require_approval = "never"

[mcp.servers.headers]
Authorization = "Bearer \${MCP_TOKEN}"
`,
  stdio: `
[mcp_servers.local]
command = "node"
args = ["/absolute/path/to/server.js"]
cwd = "/absolute/path/to/server"
message_format = "content-length"
require_approval = "never"
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

function tomlHeaders(content) {
  const lines = content.split("\n");
  const start = lines.findIndex((line) => /^\s*\[mcp\.servers\.headers\]\s*$/.test(line));
  if (start < 0) return {};
  const headers = {};
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) continue;
    if (line.startsWith("[")) break;
    const match = line.match(/^(?:"((?:\\.|[^"\\])*)"|([A-Za-z_][A-Za-z0-9_-]*))\s*=\s*"((?:\\.|[^"\\])*)"\s*$/);
    if (!match) continue;
    headers[unquoteToml(match[1] ?? match[2])] = unquoteToml(match[3]);
  }
  return headers;
}

function parseHttpHeaders(content = "") {
  const headers = {};
  const names = new Set();
  content.split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) return;
    const separator = line.indexOf(":");
    const name = separator < 0 ? "" : line.slice(0, separator).trim();
    const value = separator < 0 ? "" : line.slice(separator + 1).trim();
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) || !value) {
      throw new Error(`Invalid HTTP header on line ${index + 1}. Use Header-Name: value.`);
    }
    const normalizedName = name.toLowerCase();
    if (names.has(normalizedName)) {
      throw new Error(`Duplicate HTTP header "${name}" on line ${index + 1}.`);
    }
    names.add(normalizedName);
    headers[name] = value;
  });
  return headers;
}

function formatHttpHeaders(headers = {}) {
  return Object.entries(headers).map(([name, value]) => `${name}: ${value}`).join("\n");
}

function httpHeadersToml(content = "") {
  const headers = parseHttpHeaders(content);
  const entries = Object.entries(headers);
  if (!entries.length) return "";
  return `[mcp.servers.headers]\n${entries
    .map(([name, value]) => `"${quoteToml(name)}" = "${quoteToml(value)}"`)
    .join("\n")}`;
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
      headers: isRemote ? tomlHeaders(uncommented) : {},
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

    const tableRange = (source) => {
      const start = source.findIndex((line) => /^\s*\[mcp\.servers\.headers\]\s*$/.test(stripTomlComment(line)));
      if (start < 0) return null;
      let end = source.length;
      for (let index = start + 1; index < source.length; index += 1) {
        if (stripTomlComment(source[index]).trim().startsWith("[")) {
          end = index;
          break;
        }
      }
      return { start, end };
    };
    const currentHeaders = tableRange(lines);
    if (currentHeaders) lines.splice(currentHeaders.start, currentHeaders.end - currentHeaders.start);
    const replacementHeaders = tableRange(replacementLines);
    if (replacementHeaders) {
      const nextHeaders = replacementLines
        .slice(replacementHeaders.start, replacementHeaders.end)
        .map((line) => line.trim() ? `${commentPrefix}${stripTomlComment(line).trim()}` : line);
      if (lines.length && lines.at(-1).trim()) lines.push("");
      lines.push(...nextHeaders);
    }
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

function importMcpConfig(raw, content = "") {
  let config;
  try { config = JSON.parse(raw); } catch { throw new Error("Enter valid JSON with an mcpServers object."); }
  const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
  if (!object(config) || !object(config.mcpServers) || !Object.keys(config.mcpServers).length) {
    throw new Error("Configuration must contain a non-empty mcpServers object.");
  }
  const existing = new Set(mcpBlocks(content).map((block) => block.label));
  const string = (value) => {
    if (typeof value !== "string" || /[\r\n\x00-\x08\x0b-\x1f]/.test(value)) throw new Error("Configuration values must be single-line strings.");
    return `"${quoteToml(value)}"`;
  };
  const snippets = Object.entries(config.mcpServers).map(([label, server]) => {
    if (!/^[A-Za-z0-9_-]+$/.test(label)) throw new Error(`Invalid server name "${label}". Use letters, numbers, _ or -.`);
    if (existing.has(label)) throw new Error(`An MCP server named ${label} already exists.`);
    if (!object(server)) throw new Error(`Server ${label} must be an object.`);
    const remote = server.url !== undefined;
    const supported = remote ? ["url", "headers", "type"] : ["command", "args", "cwd", "env", "type"];
    for (const key of Object.keys(server)) {
      if (!supported.includes(key)) throw new Error(`Unsupported field "${key}" for server ${label}.`);
    }
    if (server.type !== undefined && !(remote ? ["http", "sse", "streamable-http"] : ["stdio"]).includes(server.type)) {
      throw new Error(`Unsupported type for server ${label}.`);
    }
    const target = remote ? server.url : server.command;
    if (typeof target !== "string" || !target.trim()) throw new Error(`Server ${label} requires ${remote ? "a URL" : "a command"}.`);
    const lines = remote
      ? ["[[mcp.servers]]", `server_label = ${string(label)}`, `server_url = ${string(target)}`]
      : [`[mcp_servers.${label}]`, `command = ${string(target)}`];
    if (!remote) {
      if (server.args !== undefined && !Array.isArray(server.args)) throw new Error(`Args for ${label} must be an array of strings.`);
      lines.push(`args = [${(server.args || []).map(string).join(", ")}]`);
      if (server.cwd !== undefined) lines.push(`cwd = ${string(server.cwd)}`);
    }
    lines.push('require_approval = "never"');
    const map = remote ? server.headers : server.env;
    if (map !== undefined) {
      if (!object(map)) throw new Error(`${remote ? "Headers" : "Env"} for ${label} must be an object of strings.`);
      lines.push(remote ? "[mcp.servers.headers]" : `[mcp_servers.${label}.env]`);
      for (const [key, value] of Object.entries(map)) lines.push(`${string(key)} = ${string(value)}`);
    }
    return lines.join("\n");
  });
  return `${content.trimEnd()}${content.trim() ? "\n\n" : ""}${snippets.join("\n\n")}\n`;
}

function quoteToml(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export {
  CONFIG_TEMPLATES,
  formatHttpHeaders,
  httpHeadersToml,
  importMcpConfig,
  mcpBlocks,
  parseHttpHeaders,
  quoteToml,
  replaceToolBlock,
  setToolBlockEnabled,
  updateToolBlock,
};
