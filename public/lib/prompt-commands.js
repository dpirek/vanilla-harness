const PROMPT_COMMANDS = [
  { name: "model", label: "Models", description: "Choose the model used by the active provider" },
  { name: "provider", label: "Providers", description: "Switch the active AI provider" },
  { name: "preset", label: "Presets", description: "Activate a saved configuration preset" },
  { name: "prompts", label: "System prompts", description: "Open a system prompt for editing" },
  { name: "skills", label: "Skills", description: "Enable or disable agent skills" },
  { name: "tools", label: "Tools", description: "Enable or disable workspace tools" },
  { name: "mcp", label: "MCP servers", description: "Enable or disable MCP servers" },
  { name: "workflow", label: "Workflow", description: "Enable or disable workflow stages" },
];

function parsePromptCommand(value = "") {
  const match = String(value).match(/^\s*\/([^\s]*)?(?:\s+(.*))?$/);
  if (!match) return null;
  const name = (match[1] || "").toLocaleLowerCase();
  const command = PROMPT_COMMANDS.find((entry) => entry.name === name) || null;
  return {
    name,
    command,
    query: match[2] || "",
    hasArgument: match[2] !== undefined,
  };
}

function commandMenuItems(value = "") {
  const parsed = parsePromptCommand(value);
  if (!parsed || parsed.command) return [];
  return PROMPT_COMMANDS
    .filter((command) => !parsed.name || command.name.includes(parsed.name))
    .map((command) => ({
      id: command.name,
      label: `/${command.name}`,
      description: command.description,
      command: command.name,
      complete: true,
    }));
}

function filterCommandOptions(options = [], query = "") {
  const normalized = String(query).trim().toLocaleLowerCase();
  if (!normalized) return options;
  return options.filter((option) => [option.label, option.description]
    .some((value) => String(value || "").toLocaleLowerCase().includes(normalized)));
}

export { PROMPT_COMMANDS, commandMenuItems, filterCommandOptions, parsePromptCommand };
