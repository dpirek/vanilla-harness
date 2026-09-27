import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createErrorLogStore, createRunDiagnostics, errorDetails, sanitizeDiagnostic } from "../lib/error-logs.js";
import { analyzeErrorLog } from "../lib/error-log-analysis.js";
import { handleLogsApi } from "../api/logs.js";
import { createWebSocketHandler } from "../lib/ws.js";
import { sessionActivityRuns } from "../public/lib/session-activity.js";

function fixture(t) {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  const store = createErrorLogStore(db);
  const recorder = createRunDiagnostics(store, { sessionId: "conversation-1", runId: "run-1", workspace: "/workspace", prompt: "Run tests", providerSettings: { provider: "custom", apiKey: "secret-value" } });
  const event = (value) => recorder.observe({ type: "agent_event", event: value }).event;
  return { store, recorder, event };
}

test("tool and validation failures capture input, output, context, and linked step IDs", (t) => {
  const { store, event } = fixture(t);
  const events = [
    event({ type: "tool_start", name: "run_command", callId: "call-1", args: { command: "npm test" } }),
    event({ type: "tool_result", name: "run_command", callId: "call-1", output: { ok: false, exit_code: 2, stdout: "1 failing test", stderr: "Expected 2, got 1" } }),
    event({ type: "validation", status: "failed", tool: "run_command", paths: ["app.js"] }),
  ];
  assert.equal(store.list().total, 2);
  const log = store.read(events[1].errorLogId);
  assert.equal(log.step, "Tool: run_command");
  assert.equal(log.input.args.command, "npm test");
  assert.equal(log.output.exit_code, 2);
  assert.equal(log.diagnosis.category, "command");
  assert.equal(log.diagnosis.reason, "Expected 2, got 1");
  assert.equal(log.providerSettings.apiKey, "[redacted]");
  assert.equal(log.timeline[0].type, "tool_start");
  assert.equal(store.read(events[2].errorLogId).output.stderr, "Expected 2, got 1");
  const runs = sessionActivityRuns([{ title: "Prompt sent", detail: { prompt: "Run tests", runId: "run-1" }, timestamp: 1 }, ...events.map((detail, i) => ({ title: detail.type, detail, timestamp: i + 2 }))]);
  assert.ok(runs.some((run) => run.items.some((step) => step.errorLogId === log.id)));
});

test("blocked tools reuse one log, successful steps do not log, and fatal failures retain stack", (t) => {
  const { store, recorder, event } = fixture(t);
  const blocked = event({ type: "tool_blocked", name: "missing", callId: "blocked", args: {} });
  const failed = event({ type: "tool_result", name: "missing", callId: "blocked", output: { ok: false, error: "Unknown tool: missing" } });
  assert.equal(blocked.errorLogId, failed.errorLogId);
  event({ type: "tool_start", name: "read_file", args: { path: "file" } });
  event({ type: "tool_result", name: "read_file", output: { ok: true } });
  assert.equal(store.list().total, 1);
  event({ type: "turn_start", turn: 2, model: "test-model" });
  const error = new Error("HTTP 401 unauthorized");
  const failure = recorder.observe({ type: "error", error: error.message, errorDetails: errorDetails(error) });
  const log = store.read(failure.errorLogId);
  assert.equal(log.step, "Model turn 2");
  assert.equal(log.diagnosis.category, "authentication");
  assert.match(log.error.stack, /error-logs.test.js/);
});

test("logs survive restart and review updates cannot change failure evidence", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "harness-error-logs-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  let db = new DatabaseSync(path.join(directory, "logs.sqlite"));
  let store = createErrorLogStore(db);
  const recorded = createRunDiagnostics(store, { runId: "persisted", sessionId: "session" }).observe({ type: "error", error: "Connection refused ECONNREFUSED" });
  store.review(recorded.errorLogId, { notes: "Reproduced with an offline provider.", status: "investigating" });
  store.saveAnalysis(recorded.errorLogId, { text: "Inspect provider availability.", model: "test", createdAt: 1 });
  db.close();
  db = new DatabaseSync(path.join(directory, "logs.sqlite"));
  t.after(() => db.close());
  store = createErrorLogStore(db);
  const log = store.read(recorded.errorLogId);
  assert.equal(log.status, "investigating");
  assert.match(log.notes, /offline/);
  assert.equal(log.analysis.model, "test");
  assert.equal(log.output.error, "Connection refused ECONNREFUSED");
  assert.equal(store.list({ search: "ECONNREFUSED", status: "investigating" }).total, 1);
  assert.equal(store.list({ status: "resolved" }).total, 0);
  assert.equal(store.list({ offset: 1 }).logs.length, 0);
  assert.throws(() => store.review(log.id, { notes: "", status: "bogus" }), /valid review status/);
});

test("diagnostic sanitization redacts credentials, handles cycles, and limits payloads", () => {
  const value = { apiKey: "hidden", headers: { authorization: "hidden", cookie: "hidden" }, args: { command: 'curl -H "Authorization: Bearer example-secret" https://user:password@example.test/?api_key=my-secret' }, output: 'sk-example12345 {"apiKey":"json-secret"}', large: "x".repeat(1000000) };
  value.circular = value;
  const encoded = JSON.stringify(sanitizeDiagnostic(value));
  for (const secret of ["hidden", "example-secret", "user:password", "my-secret", "sk-example12345", "json-secret"]) assert.ok(!encoded.includes(secret), secret);
  assert.ok(encoded.length < 150000);
});

async function api(store, pathname, method = "GET", body, analyze) {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
  req.method = method;
  const res = { writeHead(status) { this.status = status; }, end(value) { this.body = value ? JSON.parse(value) : undefined; } };
  const handled = await handleLogsApi(req, res, new URL(pathname, "http://localhost"), { uiStateStore: { errorLogs: store, getAll: () => ({ providerSettings: { model: "test" } }) }, analyze });
  return { ...res, handled };
}

test("logs API lists, reads, saves reviews and analysis, and reports missing IDs", async (t) => {
  const { store, recorder } = fixture(t);
  const { errorLogId: id } = recorder.observe({ type: "error", error: "A test failure" });
  const listed = await api(store, "/api/logs?limit=500&offset=-2");
  assert.equal(listed.body.limit, 100);
  assert.equal(listed.body.offset, 0);
  assert.equal(listed.body.total, 1);
  assert.equal((await api(store, `/api/logs/${id}`)).body.log.id, id);
  assert.equal((await api(store, "/api/logs/missing")).status, 404);
  assert.equal((await api(store, `/api/logs/${id}`, "DELETE")).status, 405);
  assert.equal((await api(store, `/api/logs/${id}`, "PATCH", { notes: "Fixed by a regression test", status: "resolved" })).body.log.status, "resolved");
  const result = await api(store, `/api/logs/${id}/analyze`, "POST", {}, async (log, settings) => {
    assert.equal(log.id, id); assert.equal(settings.model, "test");
    return { text: "Evidence-based analysis", model: "test", createdAt: 1 };
  });
  assert.equal(result.body.log.analysis.text, "Evidence-based analysis");
  assert.equal((await api(store, `/api/logs/${id}/analyze`, "POST", {}, async () => { throw new Error("Provider offline"); })).status, 400);
  assert.equal(store.read(id).analysis.text, "Evidence-based analysis");
});

test("model analysis uses read-only diagnostic evidence and returns attributed text", async () => {
  const result = await analyzeErrorLog({ output: { error: "Bad command" }, providerSettings: { apiKey: "do-not-send" } }, { provider: "custom", model: "test" }, {
    makeClient: () => ({ createResponse: async (body, options) => {
      assert.equal(body.tools, undefined);
      assert.match(body.instructions, /untrusted diagnostic data/);
      assert.ok(!JSON.stringify(body).includes("do-not-send"));
      assert.ok(options.signal);
      return { output: [{ type: "message", content: [{ type: "output_text", text: "Check command arguments." }] }] };
    } }),
  });
  assert.equal(result.model, "test");
  assert.equal(result.text, "Check command arguments.");
});

function frame(payload) {
  const data = Buffer.from(JSON.stringify(payload));
  const mask = Buffer.from([1, 2, 3, 4]);
  const header = Buffer.alloc(data.length < 126 ? 2 : 4);
  header[0] = 0x81; header[1] = 0x80 | (data.length < 126 ? data.length : 126);
  if (data.length >= 126) header.writeUInt16BE(data.length, 2);
  return Buffer.concat([header, mask, Buffer.from(data.map((byte, i) => byte ^ mask[i % 4]))]);
}

test("websocket records tool and fatal failures with IDs, and does not log user stops", async (t) => {
  const { store } = fixture(t);
  const socket = new EventEmitter();
  const received = [];
  socket.write = (data) => {
    if (typeof data === "string") return;
    received.push(JSON.parse(data.subarray(data[1] === 126 ? 4 : data[1] === 127 ? 10 : 2)));
  };
  socket.end = () => {};
  createWebSocketHandler({
    normalizeToolPermissions: () => ({}), resolveWorkspace: async () => "/tmp", getRigConfigurations: () => ({ configurations: [] }),
    createDiagnostics: (context) => createRunDiagnostics(store, context),
    createAgentSession: async ({ emit }) => ({ refinePrompt: async (prompt) => prompt, run: async () => {
      emit({ type: "agent_event", event: { type: "tool_start", name: "read_file", args: { path: "absent" } } });
      emit({ type: "agent_event", event: { type: "tool_result", name: "read_file", output: { ok: false, error: "ENOENT" } } });
      throw new Error("Run failed after tool failure");
    } }),
  })(socket, { headers: { "sec-websocket-key": "test" } });
  socket.emit("data", frame({ type: "prompt", prompt: "test", runId: "websocket-run", sessionId: "session" }));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(store.list().total, 2);
  assert.ok(received.find((message) => message.type === "error").errorLogId);
  assert.ok(received.find((message) => message.event?.type === "tool_result").event.errorLogId);
  socket.emit("data", Buffer.concat([frame({ type: "prompt", prompt: "stop immediately" }), frame({ type: "stop" })]));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(store.list().total, 2);
});
