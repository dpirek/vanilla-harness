import assert from "node:assert/strict";
import test from "node:test";
import { createModelClient } from "../lib/openai.js";
import { CodingAgent } from "../lib/agent.js";
import { createExecutionControl } from "../lib/ws.js";

for (const provider of ["openai", "custom", "ollama"]) {
  for (const streaming of [false, true]) {
    test(`${provider} ${streaming ? "streaming" : "non-streaming"} model request forwards cancellation`, async () => {
      const controller = new AbortController();
      const client = createModelClient({ provider, apiKey: "test", fetchImpl: async (_url, options) => {
        assert.equal(options.signal, controller.signal);
        return new Promise((_, reject) => options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true }));
      } });
      const pending = client.createResponse({ model: "test", input: [{ role: "user", content: [{ type: "input_text", text: "hi" }] }] },
        { signal: controller.signal, ...(streaming ? { onTextDelta() {} } : {}) });
      controller.abort();
      await assert.rejects(pending, { name: "AbortError" });
    });
  }
}

test("stopping during a tool prevents further model turns", async () => {
  const control = createExecutionControl();
  let calls = 0;
  const events = [];
  const agent = new CodingAgent({
    model: "test", root: "/tmp", onEvent: event => events.push(event),
    client: { createResponse: async () => {
      calls++;
      return { id: "r1", output: [{ type: "function_call", name: "wait", call_id: "c1", arguments: "{}" }] };
    } },
    tools: [{ name: "wait", parameters: {}, execute: async (_args, { signal }) => {
      assert.equal(signal, control.signal);
      control.stop();
      return { ok: true };
    } }],
  });
  await assert.rejects(agent.run("hello", { executionControl: control }), { name: "AbortError" });
  assert.equal(calls, 1);
  assert.equal(events.some(event => event.type === "tool_result" || event.type === "final"), false);
});

test("stop aborts a running local shell command", { timeout: 3000 }, async () => {
  const { createRunCommandTool } = await import("../lib/tools/run-command.js");
  const controller = new AbortController();
  const tool = createRunCommandTool({ approve: async () => true, workspace: process.cwd() });
  const pending = tool.execute({ command: "sleep 30" }, { signal: controller.signal });
  const timer = setTimeout(() => controller.abort(), 50);
  try {
    const result = await pending;
    assert.equal(result.ok, false);
    assert.equal(result.exit_code, "ABORT_ERR");
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
});
