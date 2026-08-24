import { createChromeDevToolsTool } from "./chrome-devtools.js";
import { createCurlTool } from "./curl.js";
import { createListFilesTool } from "./list-files.js";
import { createReadFileTool } from "./read-file.js";
import { createRunCommandTool } from "./run-command.js";
import { createSearchFilesTool } from "./search-files.js";
import { createWorkspaceContext } from "./workspace-context.js";
import { createWriteFileTool } from "./write-file.js";

const TOOL_NAME_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

const builtInToolFactories = Object.freeze([
  ["list_files", createListFilesTool],
  ["read_file", createReadFileTool],
  ["write_file", createWriteFileTool],
  ["search_files", createSearchFilesTool],
  ["curl", createCurlTool],
  ["run_command", createRunCommandTool],
  ["chrome_devtools", createChromeDevToolsTool],
]);

function assertToolFactory(name, factory) {
  if (typeof name !== "string" || !TOOL_NAME_PATTERN.test(name)) {
    throw new Error(`Invalid local tool name: ${name}`);
  }
  if (typeof factory !== "function") {
    throw new Error(`Local tool factory "${name}" must be a function.`);
  }
}

function assertCreatedTool(tool, registeredName) {
  if (!tool || typeof tool !== "object" || Array.isArray(tool)) {
    throw new Error(`Local tool factory "${registeredName}" must return a tool object.`);
  }
  if (tool.name !== registeredName) {
    throw new Error(
      `Local tool factory "${registeredName}" returned mismatched name "${tool.name || ""}".`,
    );
  }
  if (!tool.parameters || typeof tool.parameters !== "object" || Array.isArray(tool.parameters)) {
    throw new Error(`Local tool "${registeredName}" must define a parameters schema.`);
  }
  if (typeof tool.execute !== "function") {
    throw new Error(`Local tool "${registeredName}" must define execute().`);
  }
  return tool;
}

function createToolRegistry(initialFactories = []) {
  const factories = new Map();

  function register(name, factory, { replace = false } = {}) {
    assertToolFactory(name, factory);
    if (factories.has(name) && !replace) {
      throw new Error(`Local tool factory already registered: ${name}`);
    }
    factories.set(name, factory);
    return registry;
  }

  function unregister(name) {
    return factories.delete(name);
  }

  function createTools({ root, approve = async () => false }) {
    const context = createWorkspaceContext({ root, approve });
    return [...factories].map(([name, factory]) => assertCreatedTool(factory(context), name));
  }

  const registry = {
    createTools,
    has: (name) => factories.has(name),
    list: () => [...factories.keys()],
    register,
    unregister,
  };

  for (const entry of initialFactories) {
    if (!Array.isArray(entry) || entry.length !== 2) {
      throw new Error("Local tool registry entries must be [name, factory] pairs.");
    }
    register(entry[0], entry[1]);
  }

  return registry;
}

const toolRegistry = createToolRegistry(builtInToolFactories);

function createTools(options) {
  return toolRegistry.createTools(options);
}

export {
  builtInToolFactories,
  createToolRegistry,
  createTools,
  toolRegistry,
};
