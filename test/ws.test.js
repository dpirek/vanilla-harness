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
