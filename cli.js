#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { CodingAgent, resolveDisabledSteps } from "./lib/agent.js";
import { applyEnvironmentSettings, loadEnvironmentFile } from "./lib/env-config.js";
import { loadMcpTools } from "./lib/mcp.js";
import { createModelClient } from "./lib/openai.js";
import { defaultBaseUrlForProvider, defaultModelForProvider, normalizeProvider, resolveProviderApiKey } from "./lib/provider-config.js";
import { TerminalUI, parseCommandLine, wrapText } from "./lib/tui.js";
import { createTools } from "./lib/tools/index.js";
import { createUiStateStore, normalizeStoredToolPermissions } from "./lib/ui-state.js";
import { createWorkspaceTree } from "./lib/workspace-tree.js";
import { describeAgentEvent } from "./public/lib/agent-events.js";
import { normalizeSkillName, skillDraft, syncSkillContentName, validateSkillContent } from "./public/lib/skill-content.js";

const appRoot = path.dirname(fileURLToPath(import.meta.url));
const HELP = `Commands:
  /help                         Show this help
  /status                       Show workspace, model, preset, tools, and skills
  /workspace [path]             Show or change the workspace
  /files [path]                 Show the workspace tree
  /mkdir <path>                 Create a workspace directory
  /read <path>                  Print a text file
  /edit <path>                  Edit a file with $VISUAL or $EDITOR
  /upload <source> [path]       Copy a file into the workspace
  /sessions | /new [title]      List or create conversations
  /use <number|id>              Switch conversation
  /rename <title>               Rename the current conversation
  /delete                       Delete the current conversation
  /clear | /reset               Clear chat or reset model continuity
  /events                       Show agent events for this conversation
  /presets                      List presets
  /preset <number|id>           Activate a preset
  /preset-new <name>            Duplicate the active preset
  /preset-delete <number|id>    Delete a preset
  /provider <type> <model> [base-url] [api-key]
  /tools | /tool <name> <on|off>
  /workflow | /effect <step> <on|off>
  /mcp show | /mcp edit         View or edit MCP TOML
  /skills | /skill-toggle <number|id|name>
  /skill-new <name> | /skill-edit <number|id|name>
  /prompts | /prompt-edit <key> Edit system prompts
  /quit                         Exit

Any other line is sent to the active model.`;

function parseOptions(argv) {
  const options = { prompt: "", workspace: "", dataDir: "", help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") options.help = true;
    else if (argument === "--workspace" || argument === "-w") options.workspace = argv[++index] || "";
    else if (argument === "--data-dir") options.dataDir = argv[++index] || "";
    else if (argument === "--prompt" || argument === "-p") options.prompt = argv[++index] || "";
    else if (!argument.startsWith("-") && !options.prompt) options.prompt = argument;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

function boolValue(value) {
  if (["on", "true", "yes", "1"].includes(String(value).toLowerCase())) return true;
  if (["off", "false", "no", "0"].includes(String(value).toLowerCase())) return false;
  throw new Error("Expected on or off.");
}

function selectBy(items, selector) {
  const index = Number(selector) - 1;
  if (Number.isInteger(index) && index >= 0 && index < items.length) return items[index];
  const normalized = String(selector || "").toLowerCase();
  return items.find((item) => item.id === selector || String(item.name).toLowerCase() === normalized);
}

function titleFromPrompt(prompt) {
  const compact = String(prompt).replace(/\s+/g, " ").trim();
  return compact.length > 45 ? `${compact.slice(0, 45)}…` : compact || "New chat";
}

function transcriptPrompt(prompt, messages) {
  const history = messages.slice(-20).map((message) =>
    `${message.role === "agent" ? "Assistant" : "User"}: ${message.text.slice(0, 6000)}`).join("\n\n");
  return history ? `Continue this conversation using the prior transcript for context.\n\nPrior transcript:\n${history}\n\nCurrent user message:\n${prompt}` : prompt;
}

function treeLines(nodes, root, prefix = "") {
  const lines = [];
  nodes.forEach((node, index) => {
    const last = index === nodes.length - 1;
    lines.push(`${prefix}${last ? "└─" : "├─"} ${path.relative(root, node.path) || node.name}${node.type === "directory" ? "/" : ""}`);
    if (node.children?.length) lines.push(...treeLines(node.children, root, `${prefix}${last ? "   " : "│  "}`));
  });
  return lines;
}

class HarnessCli {
  constructor({ store, ui, workspace }) {
    this.store = store;
    this.ui = ui;
    this.workspace = workspace;
    this.agent = null;
    const sessions = store.getAll().sessions || [];
    this.session = sessions[0] || this.newSession("New chat", false);
  }

  sessions() { return this.store.getAll().sessions || []; }
  activeConfig() {
    const state = this.store.getRigConfigurations();
    return state.configurations.find((item) => item.id === state.activeConfigurationId) || state.configurations[0];
  }
  saveSession() {
    const sessions = this.sessions().filter((item) => item.id !== this.session.id);
    this.session.updatedAt = Date.now();
    this.store.set({ sessions: [this.session, ...sessions] });
  }
  newSession(title = "New chat", persist = true) {
    this.session = { id: crypto.randomUUID(), title, workspace: this.workspace, messages: [], events: [], tokenHistory: [], updatedAt: Date.now() };
    this.agent = null;
    if (persist) this.saveSession();
    return this.session;
  }
  invalidateAgent() { this.agent = null; }

  async createAgent() {
    const preset = this.activeConfig();
    const settings = preset.providerSettings;
    const provider = normalizeProvider(settings.provider);
    const apiKey = resolveProviderApiKey(provider, settings.apiKey);
    if (provider === "openai" && !apiKey) throw new Error("Configure an OpenAI API key with /provider or OPENAI_API_KEY.");
    const disabledSteps = resolveDisabledSteps([], preset.componentState.effects);
    const disabled = new Set(disabledSteps);
    const permissions = normalizeStoredToolPermissions(preset.toolPermissions);
    const localTools = disabled.has("tools") ? [] : createTools({ root: this.workspace, approve: async () => true })
      .filter((tool) => permissions[tool.name] === true);
    const mcpTools = disabled.has("mcp") ? [] : await loadMcpTools({
      root: this.workspace, configContent: preset.mcpConfig, approve: async () => true,
      autoApprove: true, onInfo: (message) => this.ui.info(message),
    });
    const client = createModelClient({
      provider, apiKey,
      baseUrl: settings.baseUrl || defaultBaseUrlForProvider(provider),
    });
    return new CodingAgent({
      client, tools: [...localTools, ...mcpTools], model: settings.model || defaultModelForProvider(provider),
      root: this.workspace, disabledSteps, systemPrompts: preset.systemPrompts,
      skills: this.store.getSelectedSkills(), approve: async () => true,
      onInfo: (message) => this.ui.info(message),
      onTool: ({ name, args }) => this.ui.info(`Tool: ${name} ${JSON.stringify(args)}`),
      onEvent: (detail) => this.session.events.push({ title: describeAgentEvent(detail), detail, timestamp: Date.now() }),
      onTextDelta: (text) => this.ui.write(text),
    });
  }

  async chat(prompt) {
    const preset = this.activeConfig();
    const disabled = resolveDisabledSteps([], preset.componentState.effects);
    this.agent ||= await this.createAgent();
    const prior = [...this.session.messages];
    this.session.messages.push({ role: "user", text: prompt });
    if (this.session.title === "New chat") this.session.title = titleFromPrompt(prompt);
    this.ui.line(this.ui.style(`\n${preset.providerSettings.model}`, "cyan"));
    try {
      const composed = disabled.includes("composer") ? prompt : await this.agent.refinePrompt(prompt);
      const input = this.agent.previousResponseId ? composed : transcriptPrompt(composed, prior);
      const answer = await this.agent.run(input, { disabledSteps: disabled });
      this.ui.line("\n");
      this.session.messages.push({ role: "agent", text: answer });
      const lastTurn = [...this.session.events].reverse().find((event) => event.detail?.type === "turn");
      const usage = lastTurn?.detail?.serverResponse?.usage;
      if (usage) this.session.tokenHistory.push({
        id: crypto.randomUUID(), prompt, inputTokens: usage.input_tokens || 0,
        outputTokens: usage.output_tokens || 0,
        totalTokens: usage.total_tokens || (usage.input_tokens || 0) + (usage.output_tokens || 0), timestamp: Date.now(),
      });
      this.saveSession();
    } catch (error) {
      this.saveSession();
      throw error;
    }
  }

  updatePreset(mutator) {
    const state = this.store.getRigConfigurations();
    const configurations = state.configurations.map((item) => item.id === state.activeConfigurationId
      ? { ...mutator(structuredClone(item)), updatedAt: Date.now() } : item);
    this.store.setRigConfigurations(configurations, state.activeConfigurationId);
    this.invalidateAgent();
  }

  status() {
    const preset = this.activeConfig();
    const enabledTools = Object.entries(preset.toolPermissions).filter(([, enabled]) => enabled).map(([name]) => name);
    const skills = this.store.getSelectedSkills().map((skill) => skill.name);
    this.ui.table([
      ["Workspace", this.workspace], ["Conversation", this.session.title], ["Preset", preset.name],
      ["Model", `${preset.providerSettings.provider} / ${preset.providerSettings.model}`],
      ["Tools", enabledTools.join(", ") || "none"], ["Skills", skills.join(", ") || "none"],
    ]);
  }

  async command(line) {
    const [command, ...args] = parseCommandLine(line);
    if (["/quit", "/exit"].includes(command)) return false;
    if (command === "/help") this.ui.line(HELP);
    else if (command === "/status") this.status();
    else if (command === "/workspace") {
      if (!args[0]) this.ui.line(this.workspace);
      else {
        const target = path.resolve(this.workspace, args[0]);
        if (!(await fs.stat(target)).isDirectory()) throw new Error("Workspace is not a directory.");
        this.workspace = await fs.realpath(target); this.session.workspace = this.workspace; this.invalidateAgent(); this.saveSession();
        this.ui.success(`Workspace: ${this.workspace}`);
      }
    } else if (command === "/files") {
      const root = args[0] ? path.resolve(this.workspace, args[0]) : this.workspace;
      if (path.relative(this.workspace, root).startsWith("..")) throw new Error("Path is outside the workspace.");
      this.ui.line(treeLines(await createWorkspaceTree(root), root).join("\n") || "(empty)");
    } else if (command === "/mkdir") {
      if (!args[0]) throw new Error("Usage: /mkdir <path>");
      const directory = path.resolve(this.workspace, args[0]);
      if (path.relative(this.workspace, directory).startsWith("..")) throw new Error("Path is outside the workspace.");
      await fs.mkdir(directory, { recursive: true });
      this.ui.success(`Created ${path.relative(this.workspace, directory)}`);
    } else if (command === "/read") {
      if (!args[0]) throw new Error("Usage: /read <path>");
      const file = path.resolve(this.workspace, args[0]);
      if (path.relative(this.workspace, file).startsWith("..")) throw new Error("Path is outside the workspace.");
      this.ui.line(await fs.readFile(file, "utf8"));
    } else if (command === "/edit") {
      if (!args[0]) throw new Error("Usage: /edit <path>");
      const file = path.resolve(this.workspace, args[0]);
      if (path.relative(this.workspace, file).startsWith("..")) throw new Error("Path is outside the workspace.");
      const content = await fs.readFile(file, "utf8").catch((error) => error.code === "ENOENT" ? "" : Promise.reject(error));
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, await this.ui.edit(content, { suffix: path.extname(file) || ".txt" }), "utf8");
      this.ui.success(`Saved ${path.relative(this.workspace, file)}`);
    } else if (command === "/upload") {
      if (!args[0]) throw new Error("Usage: /upload <source> [workspace-path]");
      const source = path.resolve(args[0]);
      const destination = path.resolve(this.workspace, args[1] || path.basename(source));
      if (path.relative(this.workspace, destination).startsWith("..")) throw new Error("Destination is outside the workspace.");
      await fs.mkdir(path.dirname(destination), { recursive: true }); await fs.copyFile(source, destination);
      this.ui.success(`Copied to ${path.relative(this.workspace, destination)}`);
    } else if (command === "/sessions") {
      this.ui.table(this.sessions().map((item, index) => [String(index + 1), item.id === this.session.id ? "*" : "", item.title, item.workspace]), { headers: ["#", "", "Title", "Workspace"] });
    } else if (command === "/new") { this.newSession(args.join(" ") || "New chat"); this.ui.success("New conversation.");
    } else if (command === "/use") {
      const selected = selectBy(this.sessions().map((item) => ({ ...item, name: item.title })), args[0]);
      if (!selected) throw new Error("Unknown conversation."); this.session = selected; this.workspace = selected.workspace; this.invalidateAgent(); this.ui.success(`Using ${selected.title}`);
    } else if (command === "/rename") { if (!args.length) throw new Error("Usage: /rename <title>"); this.session.title = args.join(" "); this.saveSession();
    } else if (command === "/delete") {
      if (await this.ui.confirm(`Delete “${this.session.title}”?`)) {
        const remaining = this.sessions().filter((item) => item.id !== this.session.id); this.store.set({ sessions: remaining });
        this.session = remaining[0] || this.newSession("New chat", false); this.invalidateAgent();
      }
    } else if (command === "/clear") { this.session.messages = []; this.session.events = []; this.session.tokenHistory = []; this.agent?.reset(); this.saveSession();
    } else if (command === "/reset") { this.agent?.reset(); this.ui.success("Model continuity reset.");
    } else if (command === "/events") this.session.events.forEach((event) => this.ui.line(`${new Date(event.timestamp).toLocaleTimeString()}  ${event.title}`));
    else if (command === "/presets") {
      const state = this.store.getRigConfigurations();
      this.ui.table(state.configurations.map((item, index) => [String(index + 1), item.id === state.activeConfigurationId ? "*" : "", item.name, item.providerSettings.model]), { headers: ["#", "", "Preset", "Model"] });
    } else if (command === "/preset") {
      const state = this.store.getRigConfigurations(); const selected = selectBy(state.configurations, args[0]);
      if (!selected) throw new Error("Unknown preset."); this.store.setRigConfigurations(state.configurations, selected.id); this.invalidateAgent(); this.ui.success(`Activated ${selected.name}`);
    } else if (command === "/preset-new") {
      const state = this.store.getRigConfigurations(); const active = this.activeConfig(); const duplicate = { ...structuredClone(active), id: crypto.randomUUID(), name: args.join(" ") || `Copy of ${active.name}`, selected: true, updatedAt: Date.now() };
      this.store.setRigConfigurations([duplicate, ...state.configurations], duplicate.id); this.invalidateAgent();
    } else if (command === "/preset-delete") {
      const state = this.store.getRigConfigurations(); const selected = selectBy(state.configurations, args[0]);
      if (!selected) throw new Error("Unknown preset."); if (state.configurations.length === 1) throw new Error("Cannot delete the only preset.");
      if (await this.ui.confirm(`Delete “${selected.name}”?`)) { const remaining = state.configurations.filter((item) => item.id !== selected.id); this.store.setRigConfigurations(remaining, selected.id === state.activeConfigurationId ? remaining[0].id : state.activeConfigurationId); this.invalidateAgent(); }
    } else if (command === "/provider") {
      if (args.length < 2) throw new Error("Usage: /provider <openai|ollama|custom> <model> [base-url] [api-key]");
      const provider = normalizeProvider(args[0]); if (provider !== args[0]) throw new Error("Unknown provider.");
      this.updatePreset((preset) => ({ ...preset, providerSettings: { provider, model: args[1], baseUrl: args[2] || "", apiKey: args[3] || preset.providerSettings.apiKey || "" } }));
    } else if (command === "/tools") this.ui.table(Object.entries(this.activeConfig().toolPermissions).map(([name, enabled]) => [name, enabled ? "on" : "off"]));
    else if (command === "/tool") {
      if (args.length < 2) throw new Error("Usage: /tool <name> <on|off>"); if (!Object.hasOwn(this.activeConfig().toolPermissions, args[0])) throw new Error("Unknown tool.");
      this.updatePreset((preset) => ({ ...preset, toolPermissions: { ...preset.toolPermissions, [args[0]]: boolValue(args[1]) } }));
    } else if (command === "/workflow") this.ui.table(Object.entries(this.activeConfig().componentState.effects).map(([name, enabled]) => [name, enabled ? "on" : "off"]));
    else if (command === "/effect") {
      if (args.length < 2) throw new Error("Usage: /effect <step> <on|off>"); if (!Object.hasOwn(this.activeConfig().componentState.effects, args[0])) throw new Error("Unknown workflow step.");
      this.updatePreset((preset) => ({ ...preset, componentState: { ...preset.componentState, effects: { ...preset.componentState.effects, [args[0]]: boolValue(args[1]) } } }));
    } else if (command === "/mcp") {
      if (args[0] === "show") this.ui.line(this.activeConfig().mcpConfig || "(empty)");
      else if (args[0] === "edit") { const content = await this.ui.edit(this.activeConfig().mcpConfig, { suffix: ".toml" }); this.updatePreset((preset) => ({ ...preset, mcpConfig: content })); }
      else throw new Error("Usage: /mcp show | /mcp edit");
    } else if (command === "/skills") {
      this.ui.table(this.store.getSkills().map((skill, index) => [String(index + 1), skill.selected ? "on" : "off", skill.name]), { headers: ["#", "Selected", "Skill"] });
    } else if (command === "/skill-toggle") {
      const skills = this.store.getSkills(); const skill = selectBy(skills, args[0]); if (!skill) throw new Error("Unknown skill.");
      this.store.setSelectedSkills(skill.selected ? skills.filter((item) => item.selected && item.id !== skill.id).map((item) => item.id) : [...skills.filter((item) => item.selected).map((item) => item.id), skill.id]); this.invalidateAgent();
    } else if (command === "/skill-new") {
      const name = normalizeSkillName(args[0]); if (!name) throw new Error("Usage: /skill-new <name>");
      const content = validateSkillContent(await this.ui.edit(skillDraft(name), { suffix: ".md" })); this.store.createSkill({ name, content });
    } else if (command === "/skill-edit") {
      const skill = selectBy(this.store.getSkills(), args[0]); if (!skill) throw new Error("Unknown skill.");
      const content = validateSkillContent(syncSkillContentName(await this.ui.edit(skill.content, { suffix: ".md" }), skill.name)); this.store.updateSkill(skill.id, { name: skill.name, content }); this.invalidateAgent();
    } else if (command === "/prompts") this.ui.table(this.store.getSystemPromptRows().map((prompt) => [prompt.key, prompt.title]));
    else if (command === "/prompt-edit") {
      const prompt = this.store.getSystemPromptRows().find((item) => item.key === args[0]); if (!prompt) throw new Error("Unknown prompt key.");
      this.store.setSystemPrompt(prompt.key, await this.ui.edit(prompt.content, { suffix: ".md" })); this.invalidateAgent();
    } else throw new Error(`Unknown command: ${command}. Use /help.`);
    return true;
  }

  async run() {
    this.ui.heading("Vanilla Harness CLI"); this.status(); this.ui.info("Type /help for commands. Ctrl+C or /quit exits.\n");
    while (true) {
      const line = await this.ui.prompt();
      if (!line) continue;
      try { if (line.startsWith("/") ? !(await this.command(line)) : (await this.chat(line), false)) break; }
      catch (error) { this.ui.error(`Error: ${error.message}`); }
    }
  }
}

async function main(argv = process.argv.slice(2)) {
  const options = parseOptions(argv);
  if (options.help) { process.stdout.write(`${HELP}\n`); return; }
  const environmentFileDetected = loadEnvironmentFile(path.join(appRoot, ".env"));
  const runtimeRoot = path.resolve(options.dataDir || process.env.AI_HARNESS_DATA_DIR || process.cwd());
  await fs.mkdir(path.join(runtimeRoot, "db"), { recursive: true });
  const store = createUiStateStore(path.join(runtimeRoot, "db/ui-state.sqlite"));
  if (environmentFileDetected) applyEnvironmentSettings(store, process.env, appRoot);
  const workspace = await fs.realpath(path.resolve(options.workspace || process.env.AI_HARNESS_WORKSPACE || process.cwd()));
  const ui = new TerminalUI();
  const cli = new HarnessCli({ store, ui, workspace });
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    ui.close();
    store.close();
  };
  process.once("SIGINT", () => { close(); process.stdout.write("\n"); process.exitCode = 130; });
  try {
    if (options.prompt) await cli.chat(options.prompt);
    else await cli.run();
  } finally { close(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(`Error: ${error.message}`); process.exitCode = 1; });
}

export { HarnessCli, HELP, boolValue, parseOptions, selectBy };
