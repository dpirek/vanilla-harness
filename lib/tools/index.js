import path from "node:path";
import fs from "node:fs/promises";
import { validateFileEdits, createChangeHistory, workspacePath } from "../change-history.js";
import { createEditFilesTool, createChangeHistoryTool } from "./edit-files.js";
import { createJavaScriptTool } from "../javascript-tools.js";
import { createChromeDevToolsTool } from "./chrome-devtools.js";
import { createCurlTool } from "./curl.js";
import { createListFilesTool } from "./list-files.js";
import { createReadFileTool } from "./read-file.js";
import { createReadSkillResourceTool } from "./read-skill-resource.js";
import { createSearchSkillsTool } from "./search-skills.js";
import { createRunCommandTool } from "./run-command.js";
import { createSearchFilesTool } from "./search-files.js";
import { createSubAgentTool } from "./sub-agent.js";
import { createWorkspaceContext } from "./workspace-context.js";
import { createWriteFileTool } from "./write-file.js";

const TOOL_NAME_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

const builtInToolFactories = Object.freeze([
  ["list_files", createListFilesTool],
  ["read_file", createReadFileTool],
  ["read_skill_resource", createReadSkillResourceTool],
  ["search_skills", createSearchSkillsTool],
  ["write_file", createWriteFileTool],
  ["search_files", createSearchFilesTool],
  ["curl", createCurlTool],
  ["run_command", createRunCommandTool],
  ["chrome_devtools", createChromeDevToolsTool],
  ["delegate_to_sub_agent", createSubAgentTool],
  ["edit_files", createEditFilesTool],
  ["change_history", createChangeHistoryTool],
  ["javascript", createJavaScriptTool],
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

  function createTools({ root, approve = async () => false, subAgentManager, authorize = async () => true, store, settings } = {}) {
    const changes = createChangeHistory({ root, store, authorize });
    const context = { ...createWorkspaceContext({ root, approve }), subAgentManager, changes, settings, authorize, store };
    return [...factories].map(([name, factory]) => {
      const tool = assertCreatedTool(factory(context), name);
      return { ...tool, async execute(args, options = {}) {
        if (name === 'edit_files') validateFileEdits(args?.edits);
        const requests = Array.isArray(args?.edits) ? args.edits.map((edit) => edit.path) : typeof args?.path === 'string' ? [args.path] : [];
        if (requests.length) {
          for (const requested of requests) {
            const target = await workspacePath(root, requested);
            const relative = path.relative(await fs.realpath(root), target) || '.';
            await authorize(name, relative, { ...options, details: args });
            await workspacePath(root, requested);
          }
        } else await authorize(name, String(args?.resource ? `${args.skill}/${args.resource}` : args?.command ?? args?.url ?? args?.agent ?? args?.action ?? '*'), { ...options, details: args });
        return tool.execute(args, options);
      } };
    });
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
