import assert from "node:assert/strict";
import test from "node:test";

import { CodingAgent } from "../lib/agent.js";

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
