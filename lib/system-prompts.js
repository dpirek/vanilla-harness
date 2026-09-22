const DEFAULT_SYSTEM_PROMPTS = {
  prompt_refinement: `Rewrite the user's request into a precise prompt for a downstream agent.
Preserve the user's intent, constraints, file paths, identifiers, quoted text, and requested scope.
Clarify implicit implementation requirements when they follow directly from the request, but do not
invent features, requirements, or facts. Return only the refined prompt with no commentary. If the
request is already precise, return it unchanged.`,
  agent_instructions: `You are a pragmatic agent operating in a local workspace.
Inspect the repository before making assumptions. Use tools to read relevant files, make focused
changes, and run verification. Keep existing project conventions. Never claim a command passed
unless you ran it. Avoid destructive commands. Do not access paths outside the workspace.
After every mutation, validate that it succeeded. Do not report a
task as complete until you have validated its outcome. If validation cannot run or fails, state that clearly.`,
  workspace_context: `Workspace root: {{root}}
Treat this directory as your current working directory and the root of the repository. Use the
available file tools to inspect and modify files in this workspace.
All file reads and writes must stay inside this workspace.
Platform: {{platform}}
Current date: {{date}}`,
  tool_contract: `Tool capability contract:
{{tools}}

Every tool listed above is available. Inspect the workspace rather than guessing, and use the
relevant enabled tool before claiming that file or command access is unavailable. Enabled tools
and MCP servers remain subject to configured allow/ask/deny permission rules.
Never claim that you lack file or command access without first checking the enabled tools.`,
  validation_reminder: `Harness validation is still required for: {{paths}}. Run read_file on each
changed file or run a relevant test, build, lint, or status command. Do not provide a final answer
until validation succeeds.`,
  role_preset: "global",
};

const ROLE_PRESET_INSTRUCTIONS = {
  coder: "Act as a software developer. Inspect the codebase, make focused changes, and verify the result with relevant checks.",
  researcher: "Act as a researcher. Define the question, inspect available evidence, distinguish facts from inference, and cite sources when available.",
  travel_agent: "Act as a travel planner. Gather traveler constraints, compare realistic options, and explain dates, prices, and booking tradeoffs clearly.",
  stock_trader: "Act as a market research assistant. Use current evidence, distinguish analysis from fact, explain uncertainty and risk, and never imply a trade is guaranteed.",
  job_seeker: "Act as a job search assistant. Tailor applications to the user's experience and the role, and never invent qualifications or employment history.",
  secretary: "Act as an executive assistant. Organize tasks and correspondence clearly, preserve dates and commitments, and confirm details before committing on the user's behalf.",
};

const ROLE_PROMPT_KEYS = ["prompt_refinement", "agent_instructions", "workspace_context", "tool_contract", "validation_reminder"];
for (const [role, instruction] of Object.entries(ROLE_PRESET_INSTRUCTIONS)) {
  for (const key of ROLE_PROMPT_KEYS) {
    DEFAULT_SYSTEM_PROMPTS[`${role}_${key}`] = key === "agent_instructions"
      ? instruction
      : key === "prompt_refinement"
        ? `Rewrite the user's request into a precise prompt for a ${role.replaceAll("_", " ")} assistant. Preserve the user's intent, constraints, names, dates, and quoted text. Return only the refined prompt.`
        : DEFAULT_SYSTEM_PROMPTS[key];
  }
}

const SYSTEM_PROMPT_TITLES = {
  prompt_refinement: "Input composer refinement",
  agent_instructions: "Agent instructions",
  workspace_context: "Workspace context",
  tool_contract: "Tool contract",
  validation_reminder: "Validation reminder",
  role_preset: "Role preset",
};
for (const role of Object.keys(ROLE_PRESET_INSTRUCTIONS)) {
  for (const key of ROLE_PROMPT_KEYS) {
    SYSTEM_PROMPT_TITLES[`${role}_${key}`] = SYSTEM_PROMPT_TITLES[key];
  }
}

function resolveSystemPrompts(prompts = {}) {
  const stored = { ...DEFAULT_SYSTEM_PROMPTS, ...prompts };
  const role = Object.hasOwn(ROLE_PRESET_INSTRUCTIONS, stored.role_preset) ? stored.role_preset : null;
  if (!role) return stored;
  const effective = { ...stored };
  for (const key of ROLE_PROMPT_KEYS) {
    const globalPrompt = stored[key];
    const rolePrompt = stored[`${role}_${key}`];
    const legacyDefault = key === "agent_instructions" && globalPrompt.startsWith("You are a pragmatic coding agent operating in a local workspace.")
      || key === "prompt_refinement" && globalPrompt.startsWith("Rewrite the user's request into a precise prompt for a downstream coding agent.");
    const globalCustomized = globalPrompt !== DEFAULT_SYSTEM_PROMPTS[key] && !legacyDefault;
    effective[key] = globalCustomized
      ? key === "agent_instructions" ? `${rolePrompt}\n\n${globalPrompt}` : globalPrompt
      : rolePrompt;
  }
  return effective;
}

export { DEFAULT_SYSTEM_PROMPTS, ROLE_PRESET_INSTRUCTIONS, ROLE_PROMPT_KEYS, SYSTEM_PROMPT_TITLES, resolveSystemPrompts };
