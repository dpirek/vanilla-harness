import path from "node:path";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createRequire } from "node:module";
import { validateFileEdits, createChangeHistory, workspacePath } from "../change-history.js";
import { createToolFileStore, packageToolsRoot } from "../tool-files.js";
import { inferredWriteFilePath } from "../tool-default-paths.js";
import { createWorkspaceContext } from "./workspace-context.js";

const TOOL_NAME_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const execFileAsync = promisify(execFile);
const requireTool = createRequire(import.meta.url);
const packageToolFiles = createToolFileStore(packageToolsRoot);

function moduleFactory(manifest, toolsRoot) {
  const folder = manifest.name.replaceAll("_", "-");
  const localEntry = path.resolve(toolsRoot, folder, manifest.entry);
  const packageEntry = path.resolve(packageToolsRoot, folder, manifest.entry);
  const base = path.resolve(toolsRoot, folder);
  if (!localEntry.startsWith(`${base}${path.sep}`)) throw new Error(`Invalid tool entry: ${manifest.name}`);
  const entry = fsSync.existsSync(localEntry) ? localEntry : manifest.kind === "builtin" ? packageEntry : localEntry;
  if (!fsSync.existsSync(entry)) throw new Error(`Tool ${manifest.name} is missing ${manifest.entry}.`);
  const actual = fsSync.realpathSync(entry);
  const actualFolder = fsSync.realpathSync(entry === packageEntry ? path.resolve(packageToolsRoot, folder) : base);
  if (!actual.startsWith(`${actualFolder}${path.sep}`)) throw new Error(`Tool ${manifest.name} entry leaves its folder.`);
  delete requireTool.cache[entry];
  const exported = requireTool(entry);
  const factory = exported.createTool || exported.default;
  assertToolFactory(manifest.name, factory);
  return factory;
}

function commandTool(manifest, root, toolsRoot) {
  const toolDir = path.resolve(toolsRoot, manifest.name.replaceAll("_", "-"));
  const expand = (value, input) => value.replaceAll("{{toolDir}}", toolDir).replaceAll("{{input}}", input);
  return {
    name: manifest.name,
    description: manifest.description,
    parameters: { type: "object", properties: { input: { type: "string", description: "Input passed as a command argument where {{input}} appears." } }, required: ["input"] },
    async execute(args = {}) {
      const input = String(args.input ?? "");
      const commandArgs = manifest.args.map((value) => expand(value, input));
      try {
        const { stdout, stderr } = await execFileAsync(expand(manifest.command, ""), commandArgs, { cwd: root, timeout: manifest.timeoutMs || 10000, maxBuffer: 1024 * 1024, shell: false });
        return { stdout, stderr };
      } catch (error) {
        return { error: error.message, stdout: error.stdout || "", stderr: error.stderr || "" };
      }
    },
  };
}

const builtInToolFactories = Object.freeze(packageToolFiles.list().filter((item) => item.kind === "builtin").map((item) => [item.name, moduleFactory(item, packageToolsRoot)]));

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
    const manifests = store?.getTools?.() || (this === toolRegistry ? packageToolFiles.list() : []);
    const toolsRoot = store?.getToolRoot?.() || packageToolsRoot;
    const manifestByName = new Map(manifests.map((item) => [item.name, item]));
    const entries = [...factories, ...manifests.filter((item) => !factories.has(item.name)).map((item) => [item.name, item.kind === "command" ? () => commandTool(item, root, toolsRoot) : moduleFactory(item, toolsRoot)])];
    return entries.map(([name, factory]) => {
      const tool = assertCreatedTool(factory(context), name);
      if (manifestByName.has(name)) tool.description = manifestByName.get(name).description;
      return { ...tool, async execute(args, options = {}) {
        const inferredPath = name === 'write_file' ? await inferredWriteFilePath(args, root) : null;
        const toolArgs = inferredPath
          ? { ...args, path: inferredPath, inferredPath: true }
          : name === 'list_files' && (args?.path === '' || args?.path == null)
            ? { ...args, path: '.' }
            : args;
        if (name === 'edit_files') validateFileEdits(toolArgs?.edits);
        const requests = Array.isArray(toolArgs?.edits) ? toolArgs.edits.map((edit) => edit.path) : typeof toolArgs?.path === 'string' ? [toolArgs.path] : [];
        if (requests.length) {
          for (const requested of requests) {
            const target = await workspacePath(root, requested);
            const relative = path.relative(await fs.realpath(root), target) || '.';
            await authorize(name, relative, { ...options, details: toolArgs });
            await workspacePath(root, requested);
          }
        } else await authorize(name, String(toolArgs?.resource ? `${toolArgs.skill}/${toolArgs.resource}` : toolArgs?.command ?? toolArgs?.url ?? toolArgs?.agent ?? toolArgs?.action ?? '*'), { ...options, details: toolArgs });
        return tool.execute(toolArgs, options);
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

const toolRegistry = createToolRegistry();

function createTools(options) {
  return toolRegistry.createTools(options);
}

export {
  builtInToolFactories,
  createToolRegistry,
  createTools,
  toolRegistry,
};
