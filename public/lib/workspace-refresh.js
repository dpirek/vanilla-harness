const FILE_MUTATING_TOOLS = new Set(["write_file", "run_command"]);

function shouldRefreshWorkspaceForAgentEvent(event) {
  if (event?.type !== "tool_result") return false;
  if (FILE_MUTATING_TOOLS.has(event.name)) return true;
  return event.name === "chrome_devtools" && event.output?.ok === true && Boolean(event.output.path);
}

export { shouldRefreshWorkspaceForAgentEvent };
