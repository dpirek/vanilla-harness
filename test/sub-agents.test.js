import assert from "node:assert/strict";
import test from "node:test";

import { SubAgentManager, normalizeSubAgentWorkers } from "../lib/sub-agents.js";
import { createSubAgentTool } from "../lib/tools/sub-agent.js";

test("sub-agent worker configuration normalizes preset records", () => {
  assert.deepEqual(
    normalizeSubAgentWorkers([
      { name: "review", url: "http://localhost:3001/" },
      { name: "build", url: "https://worker.test/base" },
    ]),
    [
      { name: "review", url: "http://localhost:3001" },
      { name: "build", url: "https://worker.test/base" },
    ],
  );
  assert.deepEqual(
    normalizeSubAgentWorkers([{ name: "local", url: "http://0.0.0.0:8099/a2a" }]),
    [{ name: "local", url: "http://127.0.0.1:8099/a2a" }],
  );
  assert.throws(() => normalizeSubAgentWorkers([{ name: "bad name", url: "http://localhost:3001" }]), /Invalid sub-agent name/);
  assert.throws(() => normalizeSubAgentWorkers([{ name: "agent", url: "file:///tmp/worker" }]), /HTTP or HTTPS/);
});

test("delegation follows the A2A acknowledgement and callback contract", async () => {
  let manager;
  let request;
  const submittedMessageIds = [];
  const fetchImpl = async (url, options) => {
    request = { url, options, body: JSON.parse(options.body) };
    submittedMessageIds.push(request.body.message.messageId);
    if (submittedMessageIds.length < 3) throw new Error("fetch failed");
    setTimeout(() => {
      manager.receiveCallback(`Bearer ${request.body.callback.token}`, {
        taskId: "task-123",
        inReplyTo: request.body.message.messageId,
        status: { state: "completed" },
        message: {
          messageId: "result-task-123",
          role: "agent",
          parts: [{ kind: "text", text: "Reviewed and fixed." }],
        },
      });
    }, 0);
    return new Response(JSON.stringify({ taskId: "task-123" }), {
      status: 202,
      headers: { "content-type": "application/json" },
    });
  };
  manager = new SubAgentManager({
    workers: [{ name: "reviewer", url: "http://worker.test" }],
    callbackUrl: "https://harness.test/api/sub-agents/callback",
    fetchImpl,
    retryDelayMs: 0,
  });

  const result = await manager.delegate({ agent: "reviewer", task: "Review the patch.", timeoutMs: 2_000 });
  assert.equal(request.url, "http://worker.test/a2a");
  assert.equal(submittedMessageIds.length, 3);
  assert.equal(new Set(submittedMessageIds).size, 1);
  assert.equal(request.body.message.role, "user");
  assert.deepEqual(request.body.message.parts, [{ kind: "text", text: "Review the patch." }]);
  assert.equal(request.body.callback.url, "https://harness.test/api/sub-agents/callback");
  assert.ok(request.body.callback.token);
  assert.deepEqual(result, {
    ok: true,
    agent: "reviewer",
    taskId: "task-123",
    status: "completed",
    text: "Reviewed and fixed.",
  });
  assert.equal(manager.listTasks()[0].state, "completed");
});

test("callbacks require their per-task bearer token and matching identifiers", async () => {
  let requestBody;
  const manager = new SubAgentManager({
    workers: [{ name: "builder", url: "http://worker.test/a2a" }],
    callbackUrl: "http://harness.test/api/sub-agents/callback",
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return new Response(JSON.stringify({ taskId: "task-456" }), { status: 202 });
    },
  });
  const delegated = manager.delegate({ agent: "builder", task: "Build it.", timeoutMs: 2_000 });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(manager.receiveCallback("Bearer wrong", {}).status, 401);
  assert.equal(manager.receiveCallback(`Bearer ${requestBody.callback.token}`, {
    taskId: "task-456", inReplyTo: "wrong", status: { state: "completed" },
  }).status, 400);
  assert.equal(manager.receiveCallback(`Bearer ${requestBody.callback.token}`, {
    taskId: "task-456",
    inReplyTo: requestBody.message.messageId,
    status: { state: "failed" },
    error: { code: "worker_error", message: "Tests failed." },
  }).status, 200);
  assert.deepEqual(await delegated, {
    ok: false,
    agent: "builder",
    taskId: "task-456",
    status: "failed",
    error: "Tests failed.",
  });
});

test("the sub-agent tool advertises configured workers", () => {
  const manager = new SubAgentManager({
    workers: [{ name: "reviewer", url: "http://worker.test" }],
    callbackUrl: "http://harness.test/api/sub-agents/callback",
  });
  const tool = createSubAgentTool({ subAgentManager: manager });
  assert.equal(tool.name, "delegate_to_sub_agent");
  assert.deepEqual(tool.parameters.properties.agent.enum, ["reviewer"]);
  assert.match(tool.description, /reviewer/);
});

test("delegation reports the worker and underlying connection failure", async () => {
  const connectionError = new Error("fetch failed", {
    cause: new Error("connect ECONNREFUSED 127.0.0.1:8099"),
  });
  let attempts = 0;
  const manager = new SubAgentManager({
    workers: [{ name: "dave", url: "http://0.0.0.0:8099/a2a" }],
    callbackUrl: "http://harness.test/api/sub-agents/callback",
    fetchImpl: async () => { attempts += 1; throw connectionError; },
    retryDelayMs: 0,
  });

  const result = await manager.delegate({ agent: "dave", task: "Fix it.", timeoutMs: 2_000 });

  assert.equal(result.ok, false);
  assert.equal(attempts, 3);
  assert.match(result.error, /Unable to reach sub-agent “dave”/);
  assert.match(result.error, /after 3 attempts/);
  assert.match(result.error, /http:\/\/127\.0\.0\.1:8099\/a2a/);
  assert.match(result.error, /ECONNREFUSED/);
});
