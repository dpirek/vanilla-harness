function describeAgentEvent(event) {
  if (event.type === "composer_start") return `Input Composer refining with ${event.model}`;
  if (event.type === "composer_complete") return `Input Composer refined prompt: ${event.refinedPrompt}`;
  if (event.type === "context_usage") return `Context: approximately ${event.estimatedTokens} / ${event.budget} tokens`;
  if (event.type === "context_compaction_start") return "Summarizing older conversation turns";
  if (event.type === "context_compaction_complete") return `Context compacted: approximately ${event.estimatedTokens} tokens`;
  if (event.type === "start") return "Run started";
  if (event.type === "turn_start") return `Model turn ${event.turn} started`;
  if (event.type === "turn") return `Model turn ${event.turn}`;
  if (event.type === "response") return `Response ${event.id}`;
  if (event.type === "tool_start") return `Tool started: ${event.name}`;
  if (event.type === "tool_result") {
    return `Tool ${event.output?.ok === false ? "failed" : "completed"}: ${event.name}`;
  }
  if (event.type === "validation") {
    if (event.status === "passed") return `Validation passed: ${event.tool}`;
    if (event.status === "failed") return `Validation failed: ${event.tool}`;
    if (event.status === "pending") return "Validation pending";
    return "Validation required";
  }
  if (event.type === "mcp_call") return `MCP call: ${event.server}.${event.name}`;
  if (event.type === "approval_request") return `Approval requested: ${event.server}.${event.name}`;
  if (event.type === "approval_response") {
    return `Approval ${event.approved ? "granted" : "denied"}: ${event.server}.${event.name}`;
  }
  if (event.type === "final") return "Final answer received";
  return event.type;
}

export { describeAgentEvent };
