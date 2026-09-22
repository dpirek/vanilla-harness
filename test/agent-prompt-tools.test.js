import assert from "node:assert/strict";
import test from "node:test";

import { CodingAgent } from "../lib/agent.js";
import { resolveSystemPrompts } from "../lib/system-prompts.js";

test("each role has editable prompt defaults and keeps its own changes", () => {
  const prompts = {
    role_preset: "researcher",
    researcher_agent_instructions: "Check primary sources first.",
    travel_agent_agent_instructions: "Compare flight options.",
  };
  assert.equal(resolveSystemPrompts(prompts).agent_instructions, "Check primary sources first.");
  assert.equal(resolveSystemPrompts({ ...prompts, role_preset: "travel_agent" }).agent_instructions, "Compare flight options.");
  assert.match(resolveSystemPrompts(prompts).prompt_refinement, /researcher assistant/);
  assert.equal(resolveSystemPrompts({ ...prompts, role_preset: "global" }).agent_instructions, resolveSystemPrompts({ role_preset: "global" }).agent_instructions);
});

test("selected role guidance yields to global agent instructions", async () => {
  let request;
  const agent = new CodingAgent({
    client: { async createResponse(body) {
      request = body;
      return { id: "response-1", output_text: "done", output: [] };
    } },
    model: "test-model",
    root: "/workspace",
    tools: [],
    systemPrompts: { role_preset: "researcher", agent_instructions: "Global policy: answer in Spanish." },
  });

  await agent.run("Investigate this.");

  assert.match(request.instructions, /Act as a researcher/);
  assert.match(request.instructions, /Global policy: answer in Spanish/);
  assert.ok(request.instructions.indexOf("Act as a researcher") < request.instructions.indexOf("Global policy: answer in Spanish"));
});

test("agent prompt describes provider-managed remote MCP servers", async () => {
  const requests = [];
  const client = {
    async createResponse(body) {
      requests.push(body);
      return {
        id: "response-1",
        output_text: "done",
        output: [],
      };
    },
  };
  const agent = new CodingAgent({
    client,
    model: "test-model",
    root: "/workspace",
    tools: [
      {
        type: "function",
        name: "read_file",
        description: "Read a workspace file.",
        parameters: { type: "object", properties: {} },
      },
      {
        type: "mcp",
        server_label: "docs",
        server_url: "https://example.com/mcp",
        allowed_tools: ["search", "fetch"],
        require_approval: "never",
      },
    ],
  });

  await agent.run("What tools can you use?");

  assert.match(requests[0].instructions, /- read_file: Read a workspace file\./);
  assert.match(requests[0].instructions, /Workspace root: \/workspace/);
  assert.match(
    requests[0].instructions,
    /- docs \(remote MCP server\): Available tools: search, fetch\./,
  );
  assert.deepEqual(requests[0].tools[1], {
    type: "mcp",
    server_label: "docs",
    server_url: "https://example.com/mcp",
    allowed_tools: ["search", "fetch"],
    require_approval: "never",
  });
});

test("agent prompt identifies remote MCP servers with dynamically discovered tools", async () => {
  let request;
  const agent = new CodingAgent({
    client: {
      async createResponse(body) {
        request = body;
        return { id: "response-1", output_text: "done", output: [] };
      },
    },
    model: "test-model",
    root: "/workspace",
    tools: [{
      type: "mcp",
      server_label: "dynamic",
      server_url: "https://example.com/mcp",
      require_approval: "never",
    }],
  });

  await agent.run("Use the remote server.");

  assert.match(
    request.instructions,
    /- dynamic \(remote MCP server\): Tools are discovered from the server\./,
  );
});

test("composer and coding prompts explicitly identify configured sub-agents", async () => {
  const requests = [];
  const agent = new CodingAgent({
    client: {
      async createResponse(body) {
        requests.push(body);
        return requests.length === 1
          ? { id: "composer-1", output_text: "Use a reviewer.", output: [] }
          : { id: "response-1", output_text: "done", output: [] };
      },
    },
    model: "test-model",
    root: "/workspace",
    tools: [{
      name: "delegate_to_sub_agent",
      description: "Delegate a task.",
      subAgents: ["reviewer", "builder"],
      parameters: { type: "object", properties: {} },
      async execute() { return { ok: true }; },
    }],
  });

  const refined = await agent.refinePrompt("Review this change.");
  await agent.run(refined);

  for (const request of requests) {
    assert.match(request.instructions, /Configured sub-agents available for delegation:/);
    assert.match(request.instructions, /- reviewer/);
    assert.match(request.instructions, /- builder/);
    assert.match(request.instructions, /delegate_to_sub_agent tool/);
  }
  assert.equal(Object.hasOwn(requests[1].tools[0], "subAgents"), false);
});

test("agent prompt omits workspace context when every file-access tool is unavailable", async () => {
  let request;
  const agent = new CodingAgent({
    client: {
      async createResponse(body) {
        request = body;
        return { id: "response-1", output_text: "done", output: [] };
      },
    },
    model: "test-model",
    root: "/sensitive/workspace",
    tools: [{
      name: "delegate_to_sub_agent",
      description: "Delegate a task.",
      subAgents: ["reviewer"],
      parameters: { type: "object", properties: {} },
      async execute() { return { ok: true }; },
    }],
  });

  await agent.run("Review this change.");

  assert.doesNotMatch(request.instructions, /Workspace root:/);
  assert.doesNotMatch(request.instructions, /\/sensitive\/workspace/);
  assert.doesNotMatch(request.instructions, /Platform:/);
  assert.match(request.instructions, /Configured sub-agents available for delegation:/);
});
