const FILE_MUTATING_TOOLS = new Set(["write_file", "run_command"]);

function shouldRefreshWorkspaceForAgentEvent(event) {
  return event?.type === "tool_result" && FILE_MUTATING_TOOLS.has(event.name);
}

export { shouldRefreshWorkspaceForAgentEvent };
