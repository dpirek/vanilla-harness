import { DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS } from "../sub-agents.js";
import { objectSchema } from "./shared.js";

function createSubAgentTool({ subAgentManager }) {
  const names = subAgentManager?.listWorkers().map(({ name }) => name) || [];
  return {
    name: "delegate_to_sub_agent",
    subAgents: names,
    description: names.length
      ? `Delegate an independent task to an asynchronous Agent Worker and wait for its result. Configured agents: ${names.join(", ")}.`
      : "Delegate an independent task to a configured asynchronous Agent Worker.",
    parameters: objectSchema({
      agent: {
        type: "string",
        description: "Configured sub-agent name.",
        ...(names.length ? { enum: names } : {}),
      },
      task: { type: "string", description: "Self-contained task for the fresh coding agent." },
      timeout_ms: {
        type: ["integer", "null"],
        description: `Callback timeout in milliseconds, or null for ${DEFAULT_TIMEOUT_MS}. Maximum ${MAX_TIMEOUT_MS}.`,
      },
    }),
    async execute({ agent, task, timeout_ms: timeoutMs }) {
      if (!subAgentManager || names.length === 0) {
        return { ok: false, error: "No sub-agent workers are configured." };
      }
      return subAgentManager.delegate({ agent, task, timeoutMs: timeoutMs ?? DEFAULT_TIMEOUT_MS });
    },
  };
}

export { createSubAgentTool };
