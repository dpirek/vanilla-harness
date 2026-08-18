import os from "node:os";
import { DEFAULT_SYSTEM_PROMPTS } from "./system-prompts.js";

const WORKFLOW_STEPS = ["composer", "tools", "mcp", "validation", "response"];

function resolveDisabledSteps(requestedSteps = [], effects = {}) {
  const allowedSteps = new Set(WORKFLOW_STEPS);
  const disabled = new Set(
    (Array.isArray(requestedSteps) ? requestedSteps : [])
      .filter((step) => allowedSteps.has(step)),
  );
  for (const step of WORKFLOW_STEPS) {
    if (effects?.[step] === false) disabled.add(step);
  }
  return [...disabled];
}

function interpolatePrompt(template, values) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => values[key] ?? `{{${key}}}`);
}

function environmentInstructions(root, tools = [], prompts = DEFAULT_SYSTEM_PROMPTS, disabledSteps = new Set()) {
  const availableTools = tools
    .filter((tool) => tool.type !== "mcp" && tool.name)
    .map((tool) => `- ${tool.name}: ${tool.description || "Available for this session."}`)
    .join("\n");
  const values = {
    root,
    tools: availableTools || "- No built-in workspace tools are enabled for this session.",
    platform: `${process.platform} ${os.release()}`,
    date: new Date().toISOString().slice(0, 10),
  };
  const promptSections = [
    disabledSteps.has("composer") ? "" : prompts.agent_instructions,
    prompts.workspace_context,
    disabledSteps.has("tools") && disabledSteps.has("mcp") ? "" : prompts.tool_contract,
  ];
  return promptSections
    .filter(Boolean)
    .map((prompt) => interpolatePrompt(prompt, values)).join("\n\n");
}

function skillInstructions(skills = []) {
  if (!Array.isArray(skills) || skills.length === 0) return "";
  const sections = skills
    .filter((skill) => typeof skill?.content === "string" && skill.content.trim())
    .map((skill) => `Skill: ${skill.name || skill.id || "Unnamed"}\n${skill.content.trim()}`);
  if (sections.length === 0) return "";
  return `Selected skill guides:\n\n${sections.join("\n\n")}`;
}

// Converts an internal tool implementation into the JSON schema shape expected
// by the Responses API function-calling interface.
function toolDefinition(tool) {
  if (tool.type === "mcp") return tool;
  return {
    type: "function",
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    strict: tool.strict !== false,
  };
}

// Responses can expose text either as output_text or nested message content.
// This helper hides that response-shape detail from the main agent loop.
function extractText(response) {
  if (response.output_text) return response.output_text;
  const parts = [];
  for (const item of response.output || []) {
    if (item.type !== "message") continue;
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) parts.push(content.text);
    }
  }
  return parts.join("\n");
}

function promptContent(prompt) {
  if (typeof prompt === "string") {
    return [{ type: "input_text", text: prompt }];
  }
  const text = prompt?.text || "";
  const content = [{ type: "input_text", text }];
  for (const image of prompt?.images || []) {
    if (!image?.dataUrl) continue;
    content.push({
      type: "input_image",
      image_url: image.dataUrl,
    });
  }
  return content;
}

class CodingAgent {
  constructor({
    client,
    tools,
    model,
    root,
    onTool = () => {},
    onInfo = () => {},
    onEvent = () => {},
    onTextDelta = () => {},
    approve = async () => false,
    maxTurns = 30,
    systemPrompts = DEFAULT_SYSTEM_PROMPTS,
    disabledSteps = [],
    skills = [],
  }) {
    this.client = client;
    this.tools = tools;
    this.model = model;
    this.root = root;
    this.onTool = onTool;
    this.onInfo = onInfo;
    this.onEvent = onEvent;
    this.onTextDelta = onTextDelta;
    this.approve = approve;
    this.maxTurns = maxTurns;
    this.systemPrompts = { ...DEFAULT_SYSTEM_PROMPTS, ...systemPrompts };
    this.disabledSteps = new Set(disabledSteps);
    this.skills = Array.isArray(skills) ? skills : [];
    this.previousResponseId = null;
  }

  reset() {
    // previous_response_id links turns server-side. Clearing it starts a fresh
    // conversation while keeping the same model and tool configuration.
    this.previousResponseId = null;
  }

  async refinePrompt(prompt, { executionControl } = {}) {
    const original = typeof prompt === "string" ? prompt.trim() : "";
    if (!original) return original;
    await executionControl?.waitIfPaused?.();
    this.onEvent({ type: "composer_start", model: this.model, prompt: original });
    const response = await this.client.createResponse({
      model: this.model,
      instructions: this.systemPrompts.prompt_refinement,
      input: [{ role: "user", content: [{ type: "input_text", text: original }] }],
    });
    await executionControl?.waitIfPaused?.();
    const refined = extractText(response).trim();
    if (!refined) throw new Error("The Input Composer returned an empty prompt.");
    this.onEvent({
      type: "composer_complete",
      model: this.model,
      originalPrompt: original,
      refinedPrompt: refined,
      usage: response.usage,
    });
    return refined;
  }

  async run(prompt, { disabledSteps = [...this.disabledSteps], executionControl } = {}) {
    const runDisabledSteps = new Set(disabledSteps);
    const availableTools = this.tools.filter((tool) => {
      if (tool.type === "mcp") return !runDisabledSteps.has("mcp");
      return !runDisabledSteps.has("tools");
    });

    await executionControl?.waitIfPaused?.();
    this.onEvent({
      type: "start",
      prompt: typeof prompt === "string" ? prompt : prompt?.text || "",
      images: Array.isArray(prompt?.images) ? prompt.images.length : 0,
    });

    // The first request contains the user prompt. Later requests contain only
    // function_call_output items, linked to the prior response ID.
    let input = [{
      role: "user",
      content: promptContent(prompt),
    }];
    
    const pendingValidationPaths = new Set();

    for (let turn = 0; turn < this.maxTurns; turn += 1) {
      await executionControl?.waitIfPaused?.();
      this.onEvent({ type: "turn_start", turn: turn + 1 });
      // Instructions are resent each turn so the model always sees the current
      // workspace, platform, and date alongside the available tools.
      const body = {
        model: this.model,
        instructions: [
          environmentInstructions(this.root, availableTools, this.systemPrompts, runDisabledSteps),
          skillInstructions(this.skills),
        ].filter(Boolean).join("\n\n"),
        input,
        tools: availableTools.map(toolDefinition),
        tool_choice: "auto",
        parallel_tool_calls: false,
      };
      if (this.previousResponseId) {
        body.previous_response_id = this.previousResponseId;
      }

      const response = await this.client.createResponse(body, {
        onTextDelta: this.onTextDelta,
      });

      await executionControl?.waitIfPaused?.();
      this.previousResponseId = response.id;
      this.onEvent({
        type: "turn",
        turn: turn + 1,
        inputPrompt: body,
        serverResponse: response,
      });

      this.onEvent({ type: "response", id: response.id });
      const calls = (response.output || []).filter((item) => item.type === "function_call");
      const mcpCalls = (response.output || []).filter((item) => item.type === "mcp_call");
      const approvalRequests = (response.output || [])
        .filter((item) => item.type === "mcp_approval_request");

      for (const call of mcpCalls) {
        const label = call.server_label || "unknown";
        const name = call.name || call.tool || "unknown";
        this.onInfo(`Using MCP server ${label}.${name}.`);
        this.onEvent({ type: "mcp_call", server: label, name });
      }

      if (approvalRequests.length > 0) {
        input = [];
        for (const request of approvalRequests) {
          await executionControl?.waitIfPaused?.();
          const description = `MCP ${request.server_label}.${request.name} ${request.arguments || ""}`.trim();
          this.onInfo(`MCP server ${request.server_label}.${request.name} requested approval.`);
          this.onEvent({
            type: "approval_request",
            server: request.server_label,
            name: request.name,
          });
          this.onTool({
            name: "mcp_approval_request",
            args: {
              server_label: request.server_label,
              tool: request.name,
            },
          });
          const approved = await this.approve(description);
          await executionControl?.waitIfPaused?.();
          this.onEvent({
            type: "approval_response",
            server: request.server_label,
            name: request.name,
            approved,
          });
          input.push({
            type: "mcp_approval_response",
            approval_request_id: request.id,
            approve: approved,
            reason: approved ? "Approved by user." : "Denied by user.",
          });
        }
        continue;
      }

      // No function calls means the model has produced its final answer.
      if (calls.length === 0) {
        const text = extractText(response);
        if (!text) throw new Error("The model returned no text or tool calls.");
        if (!runDisabledSteps.has("validation") && pendingValidationPaths.size > 0) {
          const paths = [...pendingValidationPaths];
          this.onEvent({ type: "validation", status: "required", paths });
          input = [{
            role: "user",
            content: [{
              type: "input_text",
              text: interpolatePrompt(this.systemPrompts.validation_reminder, { paths: paths.join(", ") }),
            }],
          }];
          continue;
        }
        await executionControl?.waitIfPaused?.();
        this.onEvent({ type: "final", text });
        return text;
      }

      input = [];
      for (const call of calls) {
        await executionControl?.waitIfPaused?.();
        // Each tool call result is wrapped in function_call_output and sent back
        // to the model, allowing it to continue reasoning from real local data.
        let args;
        try {
          args = JSON.parse(call.arguments || "{}");
        } catch {
          args = {};
        }
        const tool = availableTools.find((candidate) => candidate.name === call.name);
        let output;
        if (!tool) {
          this.onInfo(`Blocked unavailable tool call: ${call.name}.`);
          this.onEvent({ type: "tool_blocked", name: call.name, args });
          output = { ok: false, error: `Unknown tool: ${call.name}` };
        } else {
          this.onTool({ name: call.name, args });
          this.onEvent({ type: "tool_start", name: call.name, args });
          try {
            output = await tool.execute(args);
          } catch (error) {
            output = { ok: false, error: error.message };
          }
        }
        await executionControl?.waitIfPaused?.();
        this.onEvent({ type: "tool_result", name: call.name, output });
        if (!runDisabledSteps.has("validation") && tool?.mutatesWorkspace && output?.ok === true) {
          const changedPath = output.path || args.path || call.name;
          pendingValidationPaths.add(changedPath);
          this.onEvent({
            type: "validation",
            status: "pending",
            paths: [...pendingValidationPaths],
            tool: call.name,
          });
        } else if (!runDisabledSteps.has("validation") && tool?.validatesWorkspace && pendingValidationPaths.size > 0) {
          const readPath = output?.path || args.path;
          const validatesPendingRead = call.name === "read_file" &&
            output?.ok === true && pendingValidationPaths.has(readPath);
          const validatesAll = call.name !== "read_file" && output?.ok === true;
          if (validatesPendingRead) pendingValidationPaths.delete(readPath);
          if (validatesAll) pendingValidationPaths.clear();
          this.onEvent({
            type: "validation",
            status: validatesPendingRead || validatesAll ? "passed" : "failed",
            paths: [...pendingValidationPaths],
            tool: call.name,
          });
        }
        input.push({
          type: "function_call_output",
          call_id: call.call_id,
          output: JSON.stringify(output),
        });
      }
    }

    throw new Error(`Agent exceeded the ${this.maxTurns}-turn limit.`);
  }
}

export { CodingAgent, resolveDisabledSteps };
