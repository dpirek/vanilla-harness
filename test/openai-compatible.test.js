import assert from "node:assert/strict";
import test from "node:test";

import { createModelClient } from "../lib/openai.js";

function sseResponse(events) {
  const body = `${events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("")}data: [DONE]\n\n`;
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

test("custom providers pair DeepSeek tool calls and outputs through Chat Completions", async () => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    const body = JSON.parse(options.body);
    requests.push({ url, body });
    if (requests.length === 1) {
      return sseResponse([
        {
          id: "chat-tool-turn",
          choices: [{ delta: {
            role: "assistant",
            reasoning_content: "I should inspect the file.",
            tool_calls: [{
              index: 0,
              id: "call00_HsePpQO3A3Q8BdkB8QcA2896",
              type: "function",
              function: { name: "read_file", arguments: '{"path":' },
            }],
          } }],
        },
        {
          id: "chat-tool-turn",
          choices: [{ delta: {
            tool_calls: [{ index: 0, function: { arguments: '"README.md"}' } }],
          } }],
          usage: { prompt_tokens: 20, completion_tokens: 8 },
        },
      ]);
    }
    assert.equal(body.messages.at(-2).role, "assistant");
    assert.equal(body.messages.at(-2).tool_calls[0].id, "call00_HsePpQO3A3Q8BdkB8QcA2896");
    assert.equal(body.messages.at(-1).role, "tool");
    assert.equal(body.messages.at(-1).tool_call_id, "call00_HsePpQO3A3Q8BdkB8QcA2896");
    return sseResponse([{
      id: "chat-final-turn",
      choices: [{ delta: { content: "Done" } }],
      usage: { prompt_tokens: 30, completion_tokens: 1 },
    }]);
  };
  const client = createModelClient({
    provider: "custom",
    apiKey: "deepseek-key",
    baseUrl: "https://api.deepseek.com/v1",
    fetchImpl,
  });
  const first = await client.createResponse({
    model: "deepseek-chat",
    instructions: "Use tools when needed.",
    input: [{ role: "user", content: [{ type: "input_text", text: "Read the README" }] }],
    tools: [{
      type: "function",
      name: "read_file",
      description: "Read a file",
      parameters: { type: "object", properties: { path: { type: "string" } } },
      strict: true,
    }],
    tool_choice: "auto",
  }, { onTextDelta() {} });

  assert.equal(first.output[0].call_id, "call00_HsePpQO3A3Q8BdkB8QcA2896");
  assert.equal(first.output[0].arguments, '{"path":"README.md"}');
  const deltas = [];
  const second = await client.createResponse({
    model: "deepseek-chat",
    instructions: "Use tools when needed.",
    previous_response_id: first.id,
    input: [{
      type: "function_call_output",
      call_id: first.output[0].call_id,
      output: '{"ok":true,"content":"hello"}',
    }],
    tools: [],
  }, { onTextDelta: (delta) => deltas.push(delta) });

  assert.equal(requests[0].url, "https://api.deepseek.com/v1/chat/completions");
  assert.equal(requests[1].url, "https://api.deepseek.com/v1/chat/completions");
  assert.equal(requests[0].body.tools[0].function.strict, undefined);
  assert.equal(second.output_text, "Done");
  assert.deepEqual(deltas, ["Done"]);
});
