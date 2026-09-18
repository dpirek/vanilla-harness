import assert from "node:assert/strict";
import test from "node:test";
import { createExecutionControl, decodeFrames, sendFrame } from "../lib/ws.js";

function maskedTextFrame(text) {
  const payload = Buffer.from(text);
  const mask = Buffer.from([0x12, 0x34, 0x56, 0x78]);
  const frame = Buffer.alloc(6 + payload.length);
  frame[0] = 0x81;
  frame[1] = 0x80 | payload.length;
  mask.copy(frame, 2);
  for (let index = 0; index < payload.length; index += 1) {
    frame[6 + index] = payload[index] ^ mask[index % 4];
  }
  return frame;
}

test("WebSocket frames decode masked client text and retain incomplete data", () => {
  const frame = maskedTextFrame('{"type":"reset"}');
  const incomplete = decodeFrames(frame.subarray(0, 5));
  assert.deepEqual(incomplete.messages, []);
  assert.deepEqual(incomplete.remaining, frame.subarray(0, 5));

  const decoded = decodeFrames(frame);
  assert.equal(decoded.messages.length, 1);
  assert.equal(decoded.messages[0].type, "text");
  assert.equal(decoded.messages[0].fin, true);
  assert.equal(decoded.messages[0].payload.toString(), '{"type":"reset"}');
  assert.equal(decoded.remaining.length, 0);
});

test("WebSocket frame decoding rejects unmasked client data", () => {
  assert.throws(
    () => decodeFrames(Buffer.from([0x81, 0x02, 0x6f, 0x6b])),
    /must be masked/,
  );
});

test("server WebSocket frames support short and extended payload lengths", () => {
  const writes = [];
  const socket = { destroyed: false, write: (data) => writes.push(data) };
  sendFrame(socket, "ok");
  sendFrame(socket, "x".repeat(130));

  assert.equal(writes[0][0], 0x81);
  assert.equal(writes[0][1], 2);
  assert.equal(writes[0].subarray(2).toString(), "ok");
  assert.equal(writes[1][1], 126);
  assert.equal(writes[1].readUInt16BE(2), 130);
  assert.equal(writes[1].subarray(4).toString(), "x".repeat(130));
});

test("execution control pauses once and resumes pending work", async () => {
  const events = [];
  const control = createExecutionControl({
    onPaused: () => events.push("paused"),
    onResumed: () => events.push("resumed"),
  });

  assert.equal(control.requestPause(), true);
  assert.equal(control.requestPause(), false);
  const waiting = control.waitIfPaused();
  assert.equal(control.state, "paused");
  assert.deepEqual(events, ["paused"]);
  assert.equal(control.resume(), true);
  await waiting;
  assert.equal(control.state, "running");
  assert.deepEqual(events, ["paused", "resumed"]);
});

test("stop aborts paused execution and cannot be resumed", async () => {
  const control = createExecutionControl();
  control.requestPause();
  const waiting = control.waitIfPaused();
  assert.equal(control.stop(), true);
  assert.equal(control.stop(), false);
  assert.equal(control.signal.aborted, true);
  assert.equal(control.resume(), false);
  await assert.rejects(waiting, { name: "AbortError" });
  await assert.rejects(control.waitIfPaused(), { name: "AbortError" });
});

test("stop interrupts a websocket run, ignores late output, and allows another prompt", async () => {
  const { EventEmitter } = await import("node:events");
  const { createWebSocketHandler } = await import("../lib/ws.js");
  const socket = new EventEmitter();
  const events = [];
  socket.destroyed = false;
  socket.end = () => {};
  socket.write = (data) => {
    if (typeof data === "string") return;
    const offset = data[1] === 126 ? 4 : data[1] === 127 ? 10 : 2;
    events.push(JSON.parse(data.subarray(offset).toString()));
  };
  let firstControl;
  let lateOutput;
  let finishOldRun;
  let runCount = 0;
  const handler = createWebSocketHandler({
    normalizeToolPermissions: () => ({}),
    resolveWorkspace: async () => "/tmp",
    getRigConfigurations: () => ({ configurations: [] }),
    createAgentSession: async ({ onTextDelta }) => ({
      refinePrompt: async (prompt) => prompt,
      run: async (_prompt, { executionControl }) => {
        runCount++;
        if (runCount > 1) return "next answer";
        firstControl = executionControl;
        lateOutput = onTextDelta;
        onTextDelta("partial");
        return new Promise(resolve => { finishOldRun = resolve; });
      },
    }),
  });
  handler(socket, { headers: { "sec-websocket-key": "test" } });
  const send = payload => socket.emit("data", maskedTextFrame(JSON.stringify(payload)));
  const tick = () => new Promise(resolve => setImmediate(resolve));
  send({ type: "prompt", prompt: "hello", sessionId: "one" });
  await tick();
  send({ type: "stop", sessionId: "wrong" });
  assert.equal(firstControl.signal.aborted, false);
  send({ type: "stop", sessionId: "one" });
  await tick();
  assert.equal(firstControl.signal.aborted, true);
  assert.equal(events.filter(event => event.type === "stopped").length, 1);
  lateOutput("should not appear");
  finishOldRun("late final");
  await tick();
  assert.equal(events.some(event => event.text === "should not appear" || event.text === "late final"), false);
  send({ type: "prompt", prompt: "again", sessionId: "one" });
  await tick();
  assert.ok(events.some(event => event.type === "done" && event.text === "next answer"));
});

test("stop coalesced with a prompt cancels initialization", async () => {
  const { EventEmitter } = await import("node:events");
  const { createWebSocketHandler } = await import("../lib/ws.js");
  const socket = new EventEmitter();
  let created = false;
  socket.write = () => {};
  socket.end = () => {};
  createWebSocketHandler({
    normalizeToolPermissions: () => ({}),
    resolveWorkspace: async () => "/tmp",
    getRigConfigurations: () => ({ configurations: [] }),
    createAgentSession: async () => { created = true; },
  })(socket, { headers: { "sec-websocket-key": "test" } });
  socket.emit("data", Buffer.concat([
    maskedTextFrame(JSON.stringify({ type: "prompt", prompt: "hello" })),
    maskedTextFrame(JSON.stringify({ type: "stop" })),
  ]));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(created, false);
});
